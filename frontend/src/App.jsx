
import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8001";

function App() {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [finalReview, setFinalReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cameraRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const answersRef = useRef({});
  const videoUrlsRef = useRef([]);
  const recordingQuestionRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    async function loadRoles() {
      try {
        const response = await fetch(`${API_BASE}/roles`);

        if (!response.ok) {
          throw new Error("Could not load roles.");
        }

        const data = await response.json();
        setRoles(data.roles || data);
      } catch {
        setError(
          "Backend connect avvaledu. Backend server running lo undho check cheyyandi."
        );
      }
    }

    loadRoles();

    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());

      videoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  async function loadQuestions() {
    if (!selectedRole) {
      setError("Please select a role first.");
      return;
    }

    setLoading(true);
    setError("");
    setFinalReview(false);
    setCameraReady(false);
    setIsRecording(false);
    setQuestionIndex(0);
    setQuestions([]);
    setAnswers({});
    answersRef.current = {};
    busyRef.current = false;

    videoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    videoUrlsRef.current = [];

    try {
      const response = await fetch(
        `${API_BASE}/questions/${encodeURIComponent(selectedRole)}`
      );

      if (!response.ok) {
        throw new Error("Could not load questions.");
      }

      const data = await response.json();
      const questionList = Array.isArray(data) ? data : data.questions || [];

      if (questionList.length === 0) {
        throw new Error("No questions found for this role.");
      }

      setQuestions(questionList);
    } catch (err) {
      setError(err.message || "Questions load avvaledu.");
    } finally {
      setLoading(false);
    }
  }

  function startRecording(index, stream) {
    return new Promise((resolve, reject) => {
      try {
        if (!stream) {
          reject(new Error("Camera stream is not available."));
          return;
        }

        const options = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? { mimeType: "video/webm;codecs=vp8,opus" }
          : {};

        const recorder = new MediaRecorder(stream, options);

        chunksRef.current = [];
        recordingQuestionRef.current = index;
        recorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          setIsRecording(false);
          reject(new Error("Recording start avvaledu. Please try again."));
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "video/webm",
          });

          chunksRef.current = [];

          let savedAnswer = null;

          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            videoUrlsRef.current.push(url);

            savedAnswer = {
              url,
              size: blob.size,
              recorded: true,
            };
          } else {
            savedAnswer = {
              url: null,
              size: 0,
              recorded: false,
            };
          }

          const updated = {
            ...answersRef.current,
            [index]: savedAnswer,
          };

          answersRef.current = updated;
          setAnswers(updated);
          setIsRecording(false);
          resolve(savedAnswer);
        };

        recorder.start();
        setIsRecording(true);
        resolve(true);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function enableCameraAndStart() {
    setError("");

    if (!questions.length) {
      setError("First load the interview questions.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;

      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        await cameraRef.current.play().catch(() => {});
      }

      await startRecording(0, stream);
      setCameraReady(true);
    } catch (err) {
      setError(
        err.name === "NotAllowedError"
          ? "Camera and microphone permission allow cheyyandi."
          : err.message || "Camera access avvaledu."
      );
    }
  }

  function stopAndSaveCurrentRecording() {
    return new Promise((resolve, reject) => {
      const recorder = recorderRef.current;

      if (!recorder || recorder.state !== "recording") {
        const existing = answersRef.current[questionIndex];
        resolve(existing || { recorded: false, url: null });
        return;
      }

      const currentIndex = recordingQuestionRef.current;
      const originalOnStop = recorder.onstop;

      recorder.onstop = () => {
        originalOnStop?.call(recorder);
        resolve(answersRef.current[currentIndex] || {
          recorded: false,
          url: null,
        });
      };

      try {
        recorder.stop();
      } catch (err) {
        reject(err);
      }
    });
  }

  async function handleNextQuestion() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");

    try {
      await stopAndSaveCurrentRecording();

      const nextIndex = questionIndex + 1;

      if (nextIndex >= questions.length) {
        setFinalReview(true);
        return;
      }

      setQuestionIndex(nextIndex);

      if (streamRef.current) {
        await startRecording(nextIndex, streamRef.current);
      }
    } catch (err) {
      setError(err.message || "Could not save this recording.");
    } finally {
      busyRef.current = false;
    }
  }

  async function handleFinishInterview() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");

    try {
      await stopAndSaveCurrentRecording();
      setFinalReview(true);
    } catch (err) {
      setError(err.message || "Could not finish the interview.");
    } finally {
      busyRef.current = false;
    }
  }

  function downloadRecording(answer, index) {
    if (!answer?.url) return;

    const link = document.createElement("a");
    link.href = answer.url;
    link.download = `interview-question-${index + 1}.webm`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function downloadReport() {
    const recordedCount = questions.filter(
      (_, index) => answers[index]?.recorded
    ).length;

    const report = [
      "FEARLESS INTERVIEW - FINAL REPORT",
      `Role: ${selectedRole}`,
      `Total questions: ${questions.length}`,
      `Recorded answers: ${recordedCount}`,
      `Unrecorded answers: ${questions.length - recordedCount}`,
      "",
      ...questions.map((item, index) => {
        const question =
          typeof item === "string" ? item : item.question || "Question";

        return `${index + 1}. ${question}\nStatus: ${
          answers[index]?.recorded ? "Recorded" : "Not recorded"
        }`;
      }),
    ].join("\n");

    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fearless-interview-report.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  function startNewInterview() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;

    setQuestions([]);
    setAnswers({});
    answersRef.current = {};
    setQuestionIndex(0);
    setCameraReady(false);
    setIsRecording(false);
    setFinalReview(false);
    setError("");
  }

  const currentQuestion = questions[questionIndex];
  const recordedCount = questions.filter(
    (_, index) => answers[index]?.recorded
  ).length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Fearless Interview</h1>
        <p>Practice your interview with confidence.</p>
      </header>

      <main className="panel">
        {error && <p className="error-message">{error}</p>}

        {!questions.length && (
          <section>
            <h2>Choose Your Interview Role</h2>

            <label htmlFor="role-select">Select role:</label>
            <select
              id="role-select"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
            >
              <option value="">-- Select a role --</option>
              {roles.map((role, index) => {
                const name = typeof role === "string" ? role : role.name;
                return (
                  <option key={name || index} value={name}>
                    {name}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              onClick={loadQuestions}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load Questions"}
            </button>
          </section>
        )}

        {questions.length > 0 && !finalReview && (
          <section>
            <div className="question-count">
              Question {questionIndex + 1} of {questions.length}
            </div>

            <h2>Interview Question</h2>
            <p className="question-text">
              {typeof currentQuestion === "string"
                ? currentQuestion
                : currentQuestion?.question}
            </p>

            <div className="video-container">
              <video
                ref={cameraRef}
                className="video-preview"
                autoPlay
                muted
                playsInline
              />
            </div>

            {!cameraReady ? (
              <div>
                <p>
                  Camera and microphone permission ichina tarvata recording
                  automatic ga start avutundi.
                </p>
                <button
                  type="button"
                  onClick={enableCameraAndStart}
                  className="record-button"
                >
                  Enable Camera &amp; Start Interview
                </button>
              </div>
            ) : (
              <>
                <p className="recording-status">
                  {isRecording
                    ? "Recording in progress..."
                    : "Recording stopped."}
                </p>

                {questionIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    className="next-question-button"
                    onClick={handleNextQuestion}
                    disabled={!isRecording || busyRef.current}
                  >
                    Next Question
                  </button>
                ) : (
                  <button
                    type="button"
                    className="next-question-button"
                    onClick={handleFinishInterview}
                    disabled={!isRecording || busyRef.current}
                  >
                    Finish Interview
                  </button>
                )}
              </>
            )}

            <p className="recording-note">
              No timer. Answer at your own pace. Recordings are temporary in
              this browser; download them before closing or refreshing.
            </p>
          </section>
        )}

        {finalReview && (
          <section className="final-review">
            <h2>Final Interview Review</h2>
            <p>Role: {selectedRole}</p>
            <p>Total questions: {questions.length}</p>
            <p>Recorded answers: {recordedCount}</p>
            <p>Unrecorded answers: {questions.length - recordedCount}</p>

            {questions.map((item, index) => {
              const question =
                typeof item === "string" ? item : item.question;
              const answer = answers[index];

              return (
                <article className="review-item" key={index}>
                  <h3>Question {index + 1}</h3>
                  <p>{question}</p>

                  {answer?.url ? (
                    <>
                      <video
                        controls
                        playsInline
                        src={answer.url}
                        className="video-preview"
                      />
                      <button
                        type="button"
                        onClick={() => downloadRecording(answer, index)}
                      >
                        Download Recording
                      </button>
                    </>
                  ) : (
                    <p>Recording not available.</p>
                  )}

                  <p>
                    Status: {answer?.recorded ? "Recorded" : "Not recorded"}
                  </p>
                </article>
              );
            })}

            <button type="button" onClick={downloadReport}>
              Download Interview Report
            </button>

            <button type="button" onClick={startNewInterview}>
              Start New Interview
            </button>
          </section>
        )}
      </main>

      <footer>
        <p>Fearless Interview</p>
      </footer>
    </div>
  );
}

export default App;
