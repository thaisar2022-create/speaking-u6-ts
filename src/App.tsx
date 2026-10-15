/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  words,
  sentences,
  unit6GrammarPatterns,
  schoolPhonetics,
  qaLessons,
  rearrangeLessons,
  quizQuestions,
  blanks,
  fillVocabulary,
  prepareThaiSpeechText,
  WordItem,
  SentenceItem
} from './data';

type Page = 'home' | 'learn' | 'practice' | 'flash' | 'settings';
type LearnTab = 'Words' | 'Sentences' | 'Q & A' | 'Grammar';
type PracticeMode = 'quiz' | 'blank' | 'rearrange';

interface QuizResponse {
  index: number;
  choice: number;
  correct: boolean;
}

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [learnTab, setLearnTab] = useState<LearnTab>('Words');
  const [learnIndex, setLearnIndex] = useState<number>(0);
  const [qaIndex, setQaIndex] = useState<number>(0);
  const [flashIndex, setFlashIndex] = useState<number>(0);
  const [flashBack, setFlashBack] = useState<boolean>(false);

  const [practice, setPractice] = useState<PracticeMode>('quiz');
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [fillChoice, setFillChoice] = useState<number | null>(null);
  const [fillChecked, setFillChecked] = useState<boolean>(false);

  const [quizScore, setQuizScore] = useState<number>(0);
  const [quizResponses, setQuizResponses] = useState<QuizResponse[]>([]);

  const [reorderIndex, setReorderIndex] = useState<number>(0);
  const [reorderPicked, setReorderPicked] = useState<number[]>([]);
  const [reorderChecked, setReorderChecked] = useState<boolean>(false);

  const [speed, setSpeed] = useState<number>(() => {
    const saved = localStorage.getItem('thaiSpeed');
    return saved ? parseFloat(saved) : 0.85;
  });

  const [done, setDone] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('thaiDoneUnit6V4') || '[]');
    } catch {
      return [];
    }
  });

  const [statusMessage, setStatusMessage] = useState<string>('');
  const [detectedVoices, setDetectedVoices] = useState<string>('');

  // Audio Recording State
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [audioURLs, setAudioURLs] = useState<Record<string, string>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const totalActivities = useMemo(() => {
    return (
      words.length +
      sentences.length +
      qaLessons.length +
      rearrangeLessons.length +
      quizQuestions.length +
      blanks.length
    );
  }, []);

  const progressPercent = useMemo(() => {
    return Math.min(100, Math.round((done.length / Math.max(1, totalActivities)) * 100));
  }, [done.length, totalActivities]);

  // Voice detection
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const updateVoices = () => {
        const vs = window.speechSynthesis.getVoices() || [];
        const thaiVoices = vs.filter(x => x.lang.toLowerCase().startsWith('th'));
        if (thaiVoices.length > 0) {
          setDetectedVoices(thaiVoices.map(x => `${x.name} (${x.lang})`).join(', '));
        } else {
          setDetectedVoices('No Thai voice is currently detected on this device.');
        }
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Register Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const markDone = (key: string) => {
    if (!done.includes(key)) {
      const updated = [...done, key];
      setDone(updated);
      localStorage.setItem('thaiDoneUnit6V4', JSON.stringify(updated));
    }
  };

  const navigateTo = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const speak = (rawText: string, customSpeed?: number) => {
    if (!('speechSynthesis' in window)) {
      alert('ဤဖုန်းတွင် စာသားမှ အသံဖတ်သည့်စနစ် မရရှိပါ။');
      return;
    }
    const processed = prepareThaiSpeechText(rawText);
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(processed);
    u.lang = 'th-TH';
    u.rate = customSpeed ?? speed;

    const voices = window.speechSynthesis.getVoices();
    const v =
      voices.find(v => v.lang.toLowerCase() === 'th-th') ||
      voices.find(v => v.lang.toLowerCase().startsWith('th'));
    if (v) {
      u.voice = v;
    } else {
      setStatusMessage('Thai voice not found. Your phone may use a fallback voice. For accurate Thai tones, use recorded audio in the production app.');
    }
    window.speechSynthesis.speak(u);
  };

  const toggleRecord = async (id: string = 'main') => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecordingId(null);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      alert('Recording requires HTTPS (or localhost) and a compatible browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      audioChunksRef.current = [];

      rec.ondataavailable = e => {
        if (e.data.size) audioChunksRef.current.push(e.data);
      };

      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType });
        const newUrl = URL.createObjectURL(blob);
        setAudioURLs(prev => {
          if (prev[id]) URL.revokeObjectURL(prev[id]);
          return { ...prev, [id]: newUrl };
        });
      };

      mediaRecorderRef.current = rec;
      rec.start();
      setRecordingId(id);
    } catch (e: any) {
      alert('Microphone permission unavailable: ' + e.message);
    }
  };

  const renderActions = (entry: [string, string, string], withRecord: boolean = true, recId: string = 'main') => {
    const isRecordingThis = recordingId === recId;
    const recordedUrl = audioURLs[recId];

    return (
      <>
        <div className="controls">
          <button type="button" className="btn" onClick={() => speak(entry[0])}>
            🔊 နားထောင်ပါ
          </button>
          <button type="button" className="btn secondary" onClick={() => speak(entry[0], 0.7)}>
            🐢 ဖြည်းဖြည်း
          </button>
          {withRecord && (
            <button
              type="button"
              className={`btn ${isRecordingThis ? 'recording' : 'ghost'}`}
              onClick={() => toggleRecord(recId)}
            >
              {isRecordingThis ? '⏹️ Stop recording' : '🎙️ အသံသွင်းပါ'}
            </button>
          )}
        </div>
        {withRecord && recordedUrl && (
          <div style={{ marginTop: '10px' }}>
            <p className="muted" style={{ margin: '6px 0 2px' }}>သင့်အသံကို ပြန်နားထောင်ပါ</p>
            <audio controls src={recordedUrl} />
          </div>
        )}
      </>
    );
  };

  // Sub-navigation inside Learn
  const renderTabBar = () => {
    const tabs: LearnTab[] = ['Words', 'Sentences', 'Q & A', 'Grammar'];
    return (
      <div className="controls">
        {tabs.map(n => (
          <button
            key={n}
            type="button"
            className={`btn ${learnTab === n ? '' : 'secondary'}`}
            onClick={() => {
              setLearnTab(n);
              setLearnIndex(0);
            }}
          >
            {n}
          </button>
        ))}
      </div>
    );
  };

  // QA Card
  const renderQaCard = (thai: string, mm: string, label: string, recId: string) => {
    const phon = schoolPhonetics[thai] || '';
    return (
      <div className="qa-item">
        <span className="tag">{label}</span>
        <div className="thai" lang="th">{thai}</div>
        <div className="phonetic">{phon}</div>
        <div className="mm" lang="my">{mm}</div>
        {renderActions([thai, phon, mm], true, recId)}
      </div>
    );
  };

  const stepQA = (n: number) => {
    markDone(`learn-qa-${qaIndex}`);
    setQaIndex((qaIndex + n + qaLessons.length) % qaLessons.length);
  };

  const stepLearn = (n: number) => {
    const arr = learnTab === 'Words' ? words : sentences;
    markDone(`learn-${learnTab}-${learnIndex}`);
    setLearnIndex((learnIndex + n + arr.length) % arr.length);
  };

  // Practice: Quiz Logic
  const chooseQuiz = (choiceIdx: number) => {
    const q = quizQuestions[questionIndex];
    if (quizResponses.some(x => x.index === questionIndex)) return;
    const isCorrect = choiceIdx === q.correct;
    setQuizResponses(prev => [...prev, { index: questionIndex, choice: choiceIdx, correct: isCorrect }]);
    if (isCorrect) setQuizScore(s => s + 1);
  };

  const nextQuiz = () => {
    const nextIdx = questionIndex + 1;
    setQuestionIndex(nextIdx);
    if (nextIdx >= quizQuestions.length) {
      markDone('unit6-quiz-completed');
    }
  };

  // Practice: Rearrange Logic
  const rearrangeBankOrder = (idx: number) => {
    const n = rearrangeLessons[idx].parts.length;
    return Array.from({ length: n }, (_, i) => n - 1 - i);
  };

  const pickRearranged = (partIdx: number) => {
    const lesson = rearrangeLessons[reorderIndex];
    if (reorderPicked.includes(partIdx) || reorderPicked.length >= lesson.parts.length) return;
    setReorderPicked(prev => [...prev, partIdx]);
    setReorderChecked(false);
  };

  const removeRearranged = (partIdx: number) => {
    setReorderPicked(prev => prev.filter(id => id !== partIdx));
    setReorderChecked(false);
  };

  const checkRearranged = () => {
    const lesson = rearrangeLessons[reorderIndex];
    if (reorderPicked.length !== lesson.parts.length) return;
    setReorderChecked(true);
    if (reorderPicked.every((id, j) => id === j)) {
      markDone(`rearrange-${reorderIndex}`);
    }
  };

  const resetRearranged = () => {
    setReorderPicked([]);
    setReorderChecked(false);
  };

  const nextRearranged = () => {
    setReorderIndex((reorderIndex + 1) % rearrangeLessons.length);
    resetRearranged();
  };

  // Practice: Fill Blank Logic
  const chooseFill = (choice: number) => {
    if (fillChecked) return;
    const q = blanks[questionIndex % blanks.length];
    if (choice < 0 || choice >= q.choices.length) return;
    setFillChoice(choice);
  };

  const checkBlank = () => {
    if (fillChecked || fillChoice === null) return;
    const q = blanks[questionIndex % blanks.length];
    setFillChecked(true);
    if (q.choices[fillChoice] === q.answer) {
      markDone(`blank-${questionIndex}`);
    }
  };

  const retryFill = () => {
    setFillChoice(null);
    setFillChecked(false);
  };

  const completeExercise = () => {
    const q = blanks[questionIndex % blanks.length];
    if (fillChecked && fillChoice !== null && q.choices[fillChoice] === q.answer) {
      markDone(`blank-${questionIndex}`);
    }
    setQuestionIndex((questionIndex + 1) % blanks.length);
    setFillChoice(null);
    setFillChecked(false);
  };

  // Set Practice mode
  const selectPractice = (mode: PracticeMode) => {
    setPractice(mode);
    setQuestionIndex(0);
    setFillChoice(null);
    setFillChecked(false);
    setQuizScore(0);
    setQuizResponses([]);
    setReorderIndex(0);
    setReorderPicked([]);
    setReorderChecked(false);
  };

  return (
    <div className="app">
      {/* Top Hero Banner */}
      <header className="hero">
        <div className="top">
          <div className="brandwrap">
            <img
              className="school-logo"
              src="https://lh3.googleusercontent.com/pw/AP1GczOgaajYlB0tna2h3tHcz5qkUYVKilPtE-iG2iI9HhTjmgxOtQoBcU3Q0L6qnm8euJIuRd81RCA6-1ya5D7I0ze4zn8xOKDgBqbf75rqMXMWANWcQrE=w2400"
              alt="ThaiSar school logo"
            />
            <div>
              <div className="brand-title">THAISAR</div>
              <div className="logo-label">Thai · Myanmar Speaking School</div>
            </div>
          </div>
          <div className="pill">🇹🇭 + 🇲🇲</div>
        </div>
        <h1>အခန်း (၆) · ရက်စွဲ</h1>
        <p>Unit 6 · Listening & Speaking · Beginner</p>
        <div className="progress">
          <span id="progress" style={{ width: `${progressPercent}%` }}></span>
        </div>
        <div id="progressLabel" className="small" style={{ marginTop: '7px', color: '#e2f9f0' }}>
          သင်ယူမှု တိုးတက်မှု · {progressPercent}% ({done.length} activities)
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main" className="content">
        {/* PAGE: HOME */}
        {page === 'home' && (
          <div>
            <div className="section-head">
              <h2>စတင်လေ့လာပါ 🌼</h2>
              <span className="muted">အခန်း ၆</span>
            </div>
            <div className="notice">
              အသံကို နားထောင်ပါ → လိုက်ပြောပါ → စာကြောင်းကို လေ့ကျင့်ပါ။ ထိုင်းအက္ခရာ အရင်ကျက်ရန် မလိုပါ။
            </div>
            <div className="rows" style={{ marginTop: '14px' }}>
              <button
                type="button"
                className="tile"
                onClick={() => {
                  navigateTo('learn');
                  setLearnTab('Words');
                  setLearnIndex(0);
                }}
              >
                <span className="emoji">📖</span>
                <strong>စကားလုံးများ</strong>
                <small>Vocabulary · {words.length} items</small>
              </button>
              <button
                type="button"
                className="tile"
                onClick={() => {
                  navigateTo('learn');
                  setLearnTab('Sentences');
                  setLearnIndex(0);
                }}
              >
                <span className="emoji">🎧</span>
                <strong>ဝါကျများ</strong>
                <small>Listen & repeat · {sentences.length}</small>
              </button>
              <button
                type="button"
                className="tile"
                onClick={() => {
                  navigateTo('learn');
                  setLearnTab('Grammar');
                }}
              >
                <span className="emoji">🧩</span>
                <strong>သဒ္ဒါ</strong>
                <small>Tap to see examples</small>
              </button>
              <button
                type="button"
                className="tile"
                onClick={() => {
                  navigateTo('learn');
                  setLearnTab('Q & A');
                  setQaIndex(0);
                }}
              >
                <span className="emoji">💬</span>
                <strong>အမေး / အဖြေ</strong>
                <small>12 learn-only dialogue pairs</small>
              </button>
              <button
                type="button"
                className="tile"
                onClick={() => {
                  navigateTo('practice');
                  selectPractice('quiz');
                }}
              >
                <span className="emoji">📝</span>
                <strong>Unit 6 Quiz</strong>
                <small>12 comprehension questions</small>
              </button>
            </div>

            <h3 style={{ marginTop: '24px' }}>ဒီနေ့ လေ့လာမယ့် ဝါကျ</h3>
            <div className="card">
              <span className="tag">Listen & repeat</span>
              <div className="thai" lang="th">{sentences[0][0]}</div>
              <div className="phonetic">{sentences[0][1]}</div>
              <div className="mm" lang="my">{sentences[0][2]}</div>
              <div className="controls">
                <button type="button" className="btn" onClick={() => speak(sentences[0][0])}>
                  🔊 နားထောင်ပါ
                </button>
                <button type="button" className="btn secondary" onClick={() => speak(sentences[0][0], 0.7)}>
                  🐢 ဖြည်းဖြည်း
                </button>
              </div>
            </div>

            <button type="button" className="btn wide" onClick={() => navigateTo('learn')}>
              သင်ခန်းစာ စတင်ရန် →
            </button>
          </div>
        )}

        {/* PAGE: LEARN */}
        {page === 'learn' && (
          <div>
            {learnTab === 'Q & A' ? (
              <div>
                <div className="section-head">
                  <h2>မေးခွန်းနှင့် အဖြေ · Q & A</h2>
                  <span className="counter">{qaIndex + 1} / {qaLessons.length}</span>
                </div>
                {renderTabBar()}
                <p className="section-intro">
                  ဤအမေး/အဖြေ ၁၂ တွဲသည် အခန်း (၆) စာအုပ်တွင် ပါရှိသော မူရင်း အမေးအဖြေများဖြစ်သည်။ တစ်ကြောင်းချင်း နားထောင်ပြီး လိုက်ပြောပါ။ ဖြေရန် မလိုပါ။
                </p>
                <div className="card">
                  {renderQaCard(qaLessons[qaIndex][0], qaLessons[qaIndex][2], 'Q · မေးခွန်း', 'qaQuestion')}
                  <div className="qa-divider">↓ Answer · အဖြေ</div>
                  {renderQaCard(qaLessons[qaIndex][1], qaLessons[qaIndex][3], 'A · အဖြေ', 'qaAnswer')}
                </div>
                <div className="controls">
                  <button type="button" className="btn secondary" onClick={() => stepQA(-1)}>
                    ← အရင်တစ်ခု
                  </button>
                  <button type="button" className="btn" onClick={() => stepQA(1)}>
                    နောက်တစ်ခု →
                  </button>
                </div>
                {statusMessage && <p id="status" className="footnote">{statusMessage}</p>}
              </div>
            ) : learnTab === 'Grammar' ? (
              <div>
                <div className="section-head">
                  <h2>သဒ္ဒါ · Grammar</h2>
                  <span className="counter">{unit6GrammarPatterns.length} patterns</span>
                </div>
                {renderTabBar()}
                <p className="section-intro">
                  အခန်း (၆) စာအုပ်မှ ဝါကျများတွင် ပါဝင်သော သဒ္ဒါပုံစံများကို စုစည်းထားပါသည်။ ခေါင်းစဉ်ကို နှိပ်ပြီး ထိုင်းစာ၊ အသံထွက်နှင့် မြန်မာအဓိပ္ပာယ်ကို လေ့လာပါ။
                </p>
                {unit6GrammarPatterns.map((g, j) => {
                  const examples = g.examples
                    .map(t => sentences.find(s => s[0] === t) || words.find(w => w[0] === t))
                    .filter(Boolean) as (WordItem | SentenceItem)[];
                  return (
                    <details key={g.title} className="grammar-accordion" open={j === 0}>
                      <summary>{j + 1}. {g.title}</summary>
                      <div className="grammar-body">
                        <h3 style={{ marginTop: '15px' }}>{g.formula}</h3>
                        <p className="muted">{g.explain}</p>
                        {examples.map(x => (
                          <div key={x[0]} style={{ padding: '15px 0', borderTop: '1px solid #efe7f1' }}>
                            <div className="thai" style={{ fontSize: '23px' }}>{x[0]}</div>
                            <div className="phonetic">{x[1]}</div>
                            <div className="mm">{x[2]}</div>
                            <div className="controls">
                              <button type="button" className="btn" onClick={() => speak(x[0])}>
                                🔊 နားထောင်ပါ
                              </button>
                              <button type="button" className="btn secondary" onClick={() => speak(x[0], 0.7)}>
                                🐢 ဖြည်းဖြည်း
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <div>
                {(() => {
                  const arr = learnTab === 'Words' ? words : sentences;
                  const item = arr[Math.min(learnIndex, arr.length - 1)];
                  return (
                    <div>
                      <div className="section-head">
                        <h2>နားထောင်ပြီး လိုက်ပြောပါ</h2>
                        <span className="counter">{learnIndex + 1} / {arr.length}</span>
                      </div>
                      {renderTabBar()}
                      <div className="card">
                        <span className="tag">{item[3]}</span>
                        <div className="thai" lang="th">{item[0]}</div>
                        <div className="phonetic">{item[1]}</div>
                        <div className="mm" lang="my">{item[2]}</div>
                        {renderActions([item[0], item[1], item[2]], true, 'learnMain')}
                      </div>
                      <div className="controls">
                        <button type="button" className="btn secondary" onClick={() => stepLearn(-1)}>
                          ← ရှေ့သို့
                        </button>
                        <button type="button" className="btn" onClick={() => stepLearn(1)}>
                          နောက်တစ်ခု →
                        </button>
                      </div>
                      {statusMessage && <p id="status" className="footnote">{statusMessage}</p>}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* PAGE: PRACTICE */}
        {page === 'practice' && (
          <div>
            <div className="section-head">
              <h2>Practice · လေ့ကျင့်ခန်း</h2>
            </div>
            <div className="rows practice-tiles">
              <button
                type="button"
                className="tile"
                style={{
                  background: practice === 'quiz' ? '#fff9d4' : 'white',
                  borderColor: practice === 'quiz' ? '#e7d968' : '#dfece4'
                }}
                onClick={() => selectPractice('quiz')}
              >
                <span className="emoji">📝</span>
                <strong>Unit 6 Quiz</strong>
                <small>သင်ယူထားသည်ကို စမ်းစစ်ပါ</small>
              </button>
              <button
                type="button"
                className="tile"
                style={{
                  background: practice === 'blank' ? '#fbf0ff' : 'white',
                  borderColor: practice === 'blank' ? '#e4caeb' : '#dfece4'
                }}
                onClick={() => selectPractice('blank')}
              >
                <span className="emoji">🎧</span>
                <strong>Listen & Fill</strong>
                <small>နားထောင်ပြီး ဖြည့်ပါ</small>
              </button>
              <button
                type="button"
                className="tile"
                style={{
                  background: practice === 'rearrange' ? '#fbf0ff' : 'white',
                  borderColor: practice === 'rearrange' ? '#e4caeb' : '#dfece4'
                }}
                onClick={() => selectPractice('rearrange')}
              >
                <span className="emoji">🧩</span>
                <strong>Rearrange Sentence</strong>
                <small>စကားလုံးများကို အစီအစဉ်မှန် စီပါ</small>
              </button>
            </div>

            {/* Exercise Content */}
            <div id="exercise" style={{ marginTop: '16px' }}>
              {/* QUIZ MODE */}
              {practice === 'quiz' && (
                <div>
                  {questionIndex >= quizQuestions.length ? (
                    <div className="card quiz-finish">
                      <div className="bigscore">
                        {Math.round((quizScore / quizQuestions.length) * 100)}%
                      </div>
                      <h2>Unit 6 Quiz ပြီးပါပြီ!</h2>
                      <p className="mm">{quizScore} / {quizQuestions.length} မှန်ပါတယ်။</p>
                      <p className="muted">မှားခဲ့သော မေးခွန်းများကို ပြန်ကြည့်ပြီး နောက်တစ်ကြိမ် စမ်းကြည့်နိုင်ပါတယ်။</p>
                      {quizResponses
                        .filter(x => !x.correct)
                        .map(x => (
                          <div key={x.index} className="quiz-review">
                            <strong>{quizQuestions[x.index].q}</strong>
                            <p className="muted">{quizQuestions[x.index].why}</p>
                          </div>
                        ))}
                      <button type="button" className="btn wide" onClick={() => selectPractice('quiz')}>
                        🔄 Quiz ပြန်ဖြေရန်
                      </button>
                    </div>
                  ) : (
                    (() => {
                      const q = quizQuestions[questionIndex];
                      const picked = quizResponses.find(x => x.index === questionIndex);
                      return (
                        <div className="card">
                          <span className="tag">
                            Unit 6 Quiz · {questionIndex + 1} / {quizQuestions.length}
                          </span>
                          <div className="quiz-progress">
                            <span style={{ width: `${(100 * questionIndex) / quizQuestions.length}%` }}></span>
                          </div>
                          <h3 className="quiz-question">{q.q}</h3>
                          {q.audio && (
                            <div className="controls" style={{ marginBottom: '14px' }}>
                              <button type="button" className="btn" onClick={() => speak(q.audio!)}>
                                🔊 အသံနားထောင်ပါ
                              </button>
                              <button type="button" className="btn secondary" onClick={() => speak(q.audio!, 0.7)}>
                                🐢 ဖြည်းဖြည်း
                              </button>
                            </div>
                          )}
                          <div className="stack" style={{ marginTop: '17px' }}>
                            {q.choices.map((opt, j) => {
                              let optionClass = '';
                              if (picked) {
                                if (j === q.correct) optionClass = 'correct';
                                else if (j === picked.choice) optionClass = 'incorrect';
                              }
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`quiz-option ${optionClass}`}
                                  disabled={Boolean(picked)}
                                  onClick={() => chooseQuiz(j)}
                                >
                                  {String.fromCharCode(65 + j)}. {opt}
                                </button>
                              );
                            })}
                          </div>
                          {picked ? (
                            <div>
                              <div className="quiz-feedback">
                                <strong>{picked.correct ? '✅ မှန်ပါတယ်!' : '❌ လေ့လာပြီး ထပ်စမ်းကြည့်ပါ။'}</strong>
                                <p>{q.why}</p>
                              </div>
                              <button type="button" className="btn wide" onClick={nextQuiz}>
                                {questionIndex === quizQuestions.length - 1 ? 'ရလဒ် ကြည့်ရန် →' : 'နောက်မေးခွန်း →'}
                              </button>
                            </div>
                          ) : (
                            <p className="muted" style={{ marginTop: '14px' }}>အဖြေတစ်ခုကို ရွေးပါ။</p>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {/* REARRANGE MODE */}
              {practice === 'rearrange' && (
                (() => {
                  const lesson = rearrangeLessons[reorderIndex];
                  const picked = reorderPicked;
                  const available = rearrangeBankOrder(reorderIndex).filter(id => !picked.includes(id));
                  const complete = picked.length === lesson.parts.length;
                  const correct = reorderChecked && complete && picked.every((id, j) => id === j);

                  return (
                    <div className="card">
                      <span className="tag">
                        Rearrange Sentence · {reorderIndex + 1} / {rearrangeLessons.length}
                      </span>
                      <p className="section-intro">
                        မြန်မာအဓိပ္ပာယ်ကို ဖတ်ပြီး ထိုင်းစကားလုံးများကို အစီအစဉ်မှန် စီပါ။ ကတ်တစ်ခုစီတွင် ထိုင်းစာ၊ စာအုပ်သုံး phonetic နှင့် မြန်မာအသံထွက် ပါရှိသည်။
                      </p>
                      <div className="reorder-prompt">
                        <strong>မြန်မာအဓိပ္ပာယ်</strong>
                        <div className="mm">{lesson.meaning}</div>
                      </div>
                      <div className="controls">
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => speak(lesson.parts.map(p => p[0]).join(''))}
                        >
                          🔊 နားထောင်ပါ
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => speak(lesson.parts.map(p => p[0]).join(''), 0.7)}
                        >
                          🐢 အနှေးအသံ
                        </button>
                      </div>

                      <div className="reorder-area">
                        <h4>၁။ စီထားသော စကားလုံးများ (နှိပ်၍ ပြန်ဖြုတ်နိုင်ပါသည်)</h4>
                        <div className="reorder-tiles" id="reorderAnswer">
                          {picked.length === 0 ? (
                            <div className="reorder-empty">အောက်က ကတ်များကို အစဉ်လိုက် နှိပ်ပါ။</div>
                          ) : (
                            picked.map(id => (
                              <button
                                key={id}
                                type="button"
                                className="reorder-token selected"
                                onClick={() => removeRearranged(id)}
                                aria-label={`Remove ${lesson.parts[id][0]}`}
                              >
                                <span className="reorder-thai" lang="th">{lesson.parts[id][0]}</span>
                                <span className="reorder-phon">{lesson.parts[id][1]}</span>
                                <span className="reorder-my" lang="my">{lesson.parts[id][2]}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="reorder-bank">
                        <h4>၂။ စကားလုံးကတ်များ</h4>
                        <div className="reorder-tiles" id="reorderChoices">
                          {available.length === 0 ? (
                            <span className="muted">စကားလုံးအားလုံး စီပြီးပါပြီ။</span>
                          ) : (
                            available.map(id => (
                              <button
                                key={id}
                                type="button"
                                className="reorder-token"
                                onClick={() => pickRearranged(id)}
                                aria-label={`Choose ${lesson.parts[id][0]}`}
                              >
                                <span className="reorder-thai" lang="th">{lesson.parts[id][0]}</span>
                                <span className="reorder-phon">{lesson.parts[id][1]}</span>
                                <span className="reorder-my" lang="my">{lesson.parts[id][2]}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      {reorderChecked && (
                        correct ? (
                          <>
                            <div className="reorder-status good" role="status">
                              <strong>✅ မှန်ပါတယ်!</strong> စာကြောင်းကို မှန်ကန်စွာ စီထားပါတယ်။
                            </div>
                            <div className="reorder-complete">
                              <div className="thai" lang="th">{lesson.parts.map(p => p[0]).join('')}</div>
                              <div className="phonetic">
                                {'/' + lesson.parts.map(p => p[1].replaceAll('/', '')).join('-') + '/'}
                              </div>
                              <div className="mm">{lesson.meaning}</div>
                            </div>
                          </>
                        ) : (
                          <div className="reorder-status try" role="status">
                            အစီအစဉ် မမှန်သေးပါ။ စကားလုံးကို နှိပ်ပြီး ပြန်ရွှေ့နိုင်ပါတယ်။
                          </div>
                        )
                      )}

                      <div className="reorder-controls">
                        <button type="button" className="btn secondary" onClick={resetRearranged}>
                          ↺ ပြန်စီရန်
                        </button>
                        {correct ? (
                          <button type="button" className="btn" onClick={nextRearranged}>
                            {reorderIndex === rearrangeLessons.length - 1 ? 'နောက်တစ်ကြိမ် လေ့ကျင့်ရန်' : 'နောက်ဝါကျ →'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn"
                            disabled={!complete}
                            onClick={checkRearranged}
                          >
                            ✓ အဖြေစစ်ရန်
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              {/* LISTEN & FILL MODE */}
              {practice === 'blank' && (
                (() => {
                  const i = questionIndex % blanks.length;
                  const q = blanks[i];
                  const ready = fillChoice !== null;
                  const correctIdx = q.choices.indexOf(q.answer);

                  return (
                    <div className="card fill-card">
                      <span className="tag">🎧 Listen & Fill · {i + 1} / {blanks.length}</span>
                      <p className="section-intro">
                        အသံကို နားထောင်ပြီး အဖြေမှန်ကို ရွေးပါ။ <strong>ထိုင်းစာဖတ်တတ်ရန် မလိုပါ။</strong> ကတ်တစ်ခုစီတွင် ထိုင်းစာ၊ စာအုပ်သုံး phonetic၊ မြန်မာအသံထွက်နှင့် မြန်မာအဓိပ္ပာယ် ပါရှိသည်။
                      </p>
                      <div className="fill-prompt">
                        <span className="fill-prompt-label">မြန်မာအဓိပ္ပာယ်</span>
                        <div className="mm" lang="my">{q.meaning}</div>
                        <div className="fill-blank-line" lang="th">{q.blank}</div>
                      </div>
                      <div className="controls">
                        <button type="button" className="btn" onClick={() => speak(q.full)}>
                          🔊 နားထောင်ပါ
                        </button>
                        <button type="button" className="btn secondary" onClick={() => speak(q.full, 0.7)}>
                          🐢 ဖြည်းဖြည်း
                        </button>
                      </div>

                      <h3 className="fill-heading">အဖြေတစ်ခုကို ရွေးပါ။</h3>
                      <div className="fill-options" role="group" aria-label="Listen and Fill multiple choices">
                        {q.choices.map((word, j) => {
                          const entry = fillVocabulary[word] || ['/--/', '--', '--'];
                          let stateClass = '';
                          if (fillChecked) {
                            if (j === correctIdx) stateClass = ' is-correct';
                            else if (j === fillChoice) stateClass = ' is-wrong';
                          } else if (fillChoice === j) {
                            stateClass = ' is-selected';
                          }

                          return (
                            <button
                              key={word + j}
                              type="button"
                              className={`fill-choice${stateClass}`}
                              onClick={() => chooseFill(j)}
                              disabled={fillChecked}
                              aria-pressed={fillChoice === j}
                              aria-label={`${word} · ${entry[2]}`}
                            >
                              <span className="fill-number">{String.fromCharCode(65 + j)}</span>
                              <span className="fill-lines">
                                <span className="fill-thai" lang="th">{word}</span>
                                <span className="fill-phonetic">{entry[0]}</span>
                                <span className="fill-pronunciation" lang="my">{entry[1]}</span>
                                <span className="fill-meaning" lang="my">{entry[2]}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {!fillChecked ? (
                        <button
                          type="button"
                          className="btn wide"
                          disabled={!ready}
                          onClick={checkBlank}
                        >
                          အဖြေစစ်ဆေးပါ
                        </button>
                      ) : (
                        <div>
                          <div
                            className={`fill-feedback ${fillChoice === correctIdx ? 'good' : 'retry'}`}
                            role="status"
                          >
                            <strong>
                              {fillChoice === correctIdx ? '✅ မှန်ပါတယ်!' : '📖 အဖြေမှန်ကို လေ့လာပါ။'}
                            </strong>
                            <p>
                              {fillChoice === correctIdx
                                ? 'အသံကို မှန်ကန်စွာ ရွေးချယ်နိုင်ပါတယ်။'
                                : 'မှားသောအဖြေကို ပြထားပြီး အဖြေမှန်ကို အစိမ်းရောင်ဖြင့် ပြထားပါတယ်။'}
                            </p>
                            <div className="fill-fully">
                              <div className="thai" lang="th">{q.full}</div>
                              <div className="phonetic">{schoolPhonetics[q.full] || ''}</div>
                              <div className="mm" lang="my">{q.meaning}</div>
                            </div>
                          </div>
                          <div className="controls">
                            <button type="button" className="btn secondary" onClick={retryFill}>
                              ↺ ပြန်လေ့ကျင့်ရန်
                            </button>
                            <button type="button" className="btn" onClick={completeExercise}>
                              {i === blanks.length - 1 ? 'အစက ပြန်လေ့ကျင့်ရန်' : 'နောက်မေးခွန်း →'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* PAGE: FLASHCARDS */}
        {page === 'flash' && (
          <div>
            {(() => {
              const w = words[flashIndex];
              return (
                <div>
                  <div className="section-head">
                    <h2>Flashcards · မှတ်သားလေ့ကျင့်</h2>
                    <span className="counter">{flashIndex + 1} / {words.length}</span>
                  </div>
                  <div
                    className="card"
                    style={{
                      textAlign: 'center',
                      minHeight: '310px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setFlashBack(!flashBack);
                      markDone(`card-${flashIndex}`);
                    }}
                  >
                    <span className="tag">{flashBack ? 'Meaning' : 'Thai word'}</span>
                    {flashBack ? (
                      <div className="mm" style={{ fontSize: '26px' }}>{w[2]}</div>
                    ) : (
                      <>
                        <div className="thai">{w[0]}</div>
                        <div className="phonetic">{w[1]}</div>
                      </>
                    )}
                    <p className="muted" style={{ marginTop: '12px' }}>ကတ်ကိုနှိပ်ပြီး လှန်ကြည့်ပါ</p>
                  </div>
                  <div className="controls">
                    <button type="button" className="btn secondary" onClick={() => speak(w[0])}>
                      🔊 နားထောင်ပါ
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setFlashIndex((flashIndex - 1 + words.length) % words.length);
                        setFlashBack(false);
                      }}
                    >
                      ← ရှေ့သို့
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setFlashIndex((flashIndex + 1) % words.length);
                        setFlashBack(false);
                      }}
                    >
                      နောက်တစ်ခု →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* PAGE: SETTINGS */}
        {page === 'settings' && (
          <div>
            <h2>⚙️ အသံနှင့် app settings</h2>
            <div className="card">
              <h3>Thai voice · အသံ</h3>
              <p className="muted">Thai voice selection depends on the browser and operating system.</p>
              <div id="voiceState" className="notice">
                {detectedVoices || 'Checking Thai voices on this device...'}
              </div>
              <label htmlFor="rate" style={{ display: 'block', marginTop: '12px' }}>
                Audio speed · <span id="speedLabel">{speed}</span>×
              </label>
              <input
                id="rate"
                type="range"
                min="0.5"
                max="1.1"
                step="0.05"
                value={speed}
                style={{ width: '100%', margin: '8px 0' }}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setSpeed(val);
                  localStorage.setItem('thaiSpeed', String(val));
                }}
              />
              <div className="controls">
                <button type="button" className="btn" onClick={() => speak('สวัสดีครับ')}>
                  🔊 Thai အသံ စမ်းနားထောင်ရန်
                </button>
              </div>
            </div>

            <div className="card">
              <h3>Install on phone</h3>
              <p className="muted">
                Open the hosted site in Chrome on Android or Safari on iPhone, then use Add to Home Screen / Install App.
              </p>
              <p className="small">
                A PWA needs HTTPS or localhost. The current downloaded HTML file can be opened as a preview, but installation and offline caching require hosting.
              </p>
            </div>

            <div className="card">
              <h3>Student progress</h3>
              <p className="muted">Saved on this device, not synchronized with a school account.</p>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  if (confirm('Reset your progress?')) {
                    setDone([]);
                    localStorage.removeItem('thaiDoneUnit6V4');
                  }
                }}
              >
                Reset progress
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Navigation */}
      <nav className="nav" id="nav">
        <button
          type="button"
          data-page="home"
          className={page === 'home' ? 'active' : ''}
          onClick={() => navigateTo('home')}
        >
          <span className="ico">⌂</span>ပင်မ
        </button>
        <button
          type="button"
          data-page="learn"
          className={page === 'learn' ? 'active' : ''}
          onClick={() => navigateTo('learn')}
        >
          <span className="ico">◉</span>လေ့လာ
        </button>
        <button
          type="button"
          data-page="practice"
          className={page === 'practice' ? 'active' : ''}
          onClick={() => navigateTo('practice')}
        >
          <span className="ico">✦</span>လေ့ကျင့်
        </button>
        <button
          type="button"
          data-page="flash"
          className={page === 'flash' ? 'active' : ''}
          onClick={() => navigateTo('flash')}
        >
          <span className="ico">▣</span>ကတ်များ
        </button>
        <button
          type="button"
          data-page="settings"
          className={page === 'settings' ? 'active' : ''}
          onClick={() => navigateTo('settings')}
        >
          <span className="ico">⚙</span>ချိန်ညှိ
        </button>
      </nav>
    </div>
  );
}
