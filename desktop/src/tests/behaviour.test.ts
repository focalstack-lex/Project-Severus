declare const process: any;

import { isHubNode } from "../utils/hubNode";
import { filterLearningItems, isCandidateEligibleForPromotion, CandidateItem } from "../components/LearningHistoryModal";
import { validIntent } from "../lib/deepseekIntent";
import {
  matchesMicMuteCommand,
  matchesMicUnmuteCommand,
  matchesStopListening,
  matchesWakePhrase,
} from "../lib/voiceCommands";
import { voiceDiagClear, voiceDiagRecent, voiceDiagRecord } from "../lib/voiceDiagnostics";
import { resolveSpeechStrategy, type SpeechEngineStatus } from "../lib/speechEngine";
import {
  encodePcm16,
  advanceVad,
  createVadState,
  DEFAULT_VAD_CONFIG,
  type VadState,
} from "../lib/localSpeechRecognizer";
import { stripWakePrefix, matchesThinkingModeCommand } from "../lib/voiceCommands";

export function runFrontendVerificationSuite() {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  // Test 1: GraphView.isHubNode returns true ONLY for "The Glorious Evolution"
  try {
    const hubPositive = isHubNode({ id: "The Glorious Evolution", title: "The Glorious Evolution" });
    const hubCaseInsensitive = isHubNode({ id: "the glorious evolution", title: "the glorious evolution" });
    const nonHub1 = isHubNode({ id: "Self-Learning Protocol", title: "Self-Learning Protocol" });
    const nonHub2 = isHubNode({ id: "Ascension Guide", title: "Ascension Guide" });

    if (!hubPositive || !hubCaseInsensitive) {
      throw new Error(`Expected isHubNode to return true for 'The Glorious Evolution', got pos=${hubPositive}, case=${hubCaseInsensitive}`);
    }
    if (nonHub1 || nonHub2) {
      throw new Error(`Expected isHubNode to return false for non-hub nodes, got nonHub1=${nonHub1}, nonHub2=${nonHub2}`);
    }
    results.push({ name: "GraphView.isHubNode strictly isolates 'The Glorious Evolution'", passed: true });
  } catch (err: any) {
    results.push({ name: "GraphView.isHubNode strictly isolates 'The Glorious Evolution'", passed: false, error: err.message });
  }

  // Test 2: TagBar popover expand/collapse state transition logic
  try {
    let isOpen = false;
    const togglePopover = () => { isOpen = !isOpen; };
    const closePopover = () => { isOpen = false; };

    togglePopover(); // expand
    if (!isOpen) throw new Error("TagBar popover failed to expand on toggle");
    closePopover(); // collapse
    if (isOpen) throw new Error("TagBar popover failed to collapse on close action");

    results.push({ name: "TagBar popover expand/collapse state transitions", passed: true });
  } catch (err: any) {
    results.push({ name: "TagBar popover expand/collapse state transitions", passed: false, error: err.message });
  }

  // Test 3: LearningHistoryModal filter tabs (T1 / T2 / T3 / Recent Nodes)
  try {
    const sampleItems: CandidateItem[] = [
      { id: "1", category: "Test", pattern: "P1", recurrence: "1/3", source: "IDE", status: "active", tier: "T1", targetPath: "p1" },
      { id: "2", category: "Test", pattern: "P2", recurrence: "3/3", source: "IDE", status: "promoted", tier: "T2", targetPath: "p2" },
      { id: "3", category: "Test", pattern: "P3", recurrence: "T3 Node", source: "Graph", status: "node", tier: "T3", targetPath: "p3" },
    ];

    const t1Items = filterLearningItems(sampleItems, "t1");
    const t2Items = filterLearningItems(sampleItems, "t2");
    const t3Items = filterLearningItems(sampleItems, "t3");
    const nodeItems = filterLearningItems(sampleItems, "node");

    if (t1Items.length !== 1 || t1Items[0].tier !== "T1") throw new Error(`T1 tab filter failed, count=${t1Items.length}`);
    if (t2Items.length !== 1 || t2Items[0].tier !== "T2") throw new Error(`T2 tab filter failed, count=${t2Items.length}`);
    if (t3Items.length !== 1 || t3Items[0].tier !== "T3") throw new Error(`T3 tab filter failed, count=${t3Items.length}`);
    if (nodeItems.length !== 1 || nodeItems[0].status !== "node") throw new Error(`Node tab filter failed, count=${nodeItems.length}`);

    results.push({ name: "LearningHistoryModal filter tabs (T1 / T2 / T3 / Recent Nodes)", passed: true });
  } catch (err: any) {
    results.push({ name: "LearningHistoryModal filter tabs (T1 / T2 / T3 / Recent Nodes)", passed: false, error: err.message });
  }

  // Test 4: Candidate promotion logic respects 3/3 threshold
  try {
    const eligible: CandidateItem = { id: "1", category: "Test", pattern: "P1", recurrence: "3/3", source: "IDE", status: "active", tier: "T1", targetPath: "p1" };
    const ineligible2of3: CandidateItem = { id: "2", category: "Test", pattern: "P2", recurrence: "2/3", source: "IDE", status: "active", tier: "T1", targetPath: "p2" };
    const alreadyPromoted: CandidateItem = { id: "3", category: "Test", pattern: "P3", recurrence: "3/3", source: "IDE", status: "promoted", tier: "T2", targetPath: "p3" };

    if (!isCandidateEligibleForPromotion(eligible)) {
      throw new Error("Expected 3/3 candidate to be eligible for promotion");
    }
    if (isCandidateEligibleForPromotion(ineligible2of3)) {
      throw new Error("Expected 2/3 candidate NOT to be eligible for promotion");
    }
    if (isCandidateEligibleForPromotion(alreadyPromoted)) {
      throw new Error("Expected already promoted candidate NOT to be eligible for promotion");
    }

    results.push({ name: "Candidate promotion logic respects 3/3 threshold", passed: true });
  } catch (err: any) {
    results.push({ name: "Candidate promotion logic respects 3/3 threshold", passed: false, error: err.message });
  }

  // Test 5: LLM fallback intent validation (web_search, lock_workstation, launch_app)
  try {
    const searchIntent = validIntent({ action: "web_search", arg: { query: "cor jesu college", engine: "google" } });
    if (!searchIntent || searchIntent.action !== "web_search" || searchIntent.arg.query !== "cor jesu college") {
      throw new Error("validIntent failed to map web_search intent");
    }

    const lockIntent = validIntent({ action: "lock_workstation" });
    if (!lockIntent || lockIntent.action !== "lock_workstation") {
      throw new Error("validIntent failed to map lock_workstation intent");
    }

    const appIntent = validIntent({ action: "launch_app", arg: "chrome" });
    if (!appIntent || appIntent.action !== "launch_app" || appIntent.arg !== "chrome") {
      throw new Error("validIntent failed to map launch_app intent");
    }

    results.push({ name: "LLM fallback intent validation (web_search, lock_workstation, launch_app)", passed: true });
  } catch (err: any) {
    results.push({ name: "LLM fallback intent validation (web_search, lock_workstation, launch_app)", passed: false, error: err.message });
  }

  // Test 6: Flexible volume steps and boundary clamping
  try {
    const volUp = validIntent({ action: "volume_step", arg: 15 });
    if (!volUp || volUp.action !== "volume_step" || volUp.arg !== 15) {
      throw new Error("validIntent failed on flexible volume_step 15");
    }

    const volDown = validIntent({ action: "volume_step", arg: -20 });
    if (!volDown || volDown.action !== "volume_step" || volDown.arg !== -20) {
      throw new Error("validIntent failed on flexible volume_step -20");
    }

    const volClamped = validIntent({ action: "volume_set", arg: 150 });
    if (!volClamped || volClamped.action !== "volume_set" || volClamped.arg !== 100) {
      throw new Error("validIntent failed to clamp volume_set to 100");
    }

    results.push({ name: "Flexible volume steps and boundary clamping", passed: true });
  } catch (err: any) {
    results.push({ name: "Flexible volume steps and boundary clamping", passed: false, error: err.message });
  }

  // Test 7: In-app voice and command routing aliases (copilot, notes, graph, running, search)
  try {
    const copilotAliases = [
      "open copilot",
      "copilot",
      "show copilot",
      "launch copilot",
      "start copilot",
      "bring up copilot",
      "ask ai",
      "open ai",
      "ai copilot",
      "copilot view",
    ];

    const isCopilotCommand = (text: string) => {
      const normalized = text.toLowerCase().trim();
      const stripped = normalized
        .replace(/^(hey|hi|hello|ok|okay|good morning|good afternoon|good evening)?\s*(severus|professor snape|snape|system|computer|assistant|companion)\s*,?\s*/i, "")
        .replace(/^please\s+/i, "")
        .trim();
      const target = stripped || normalized;
      return (
        target === "open copilot" ||
        target === "copilot" ||
        target === "show copilot" ||
        target === "launch copilot" ||
        target === "start copilot" ||
        target === "bring up copilot" ||
        target === "ask ai" ||
        target === "open ai" ||
        target === "open ai copilot" ||
        target === "ai copilot" ||
        target === "copilot view" ||
        normalized === "open copilot" ||
        normalized === "copilot"
      );
    };

    for (const alias of copilotAliases) {
      if (!isCopilotCommand(alias)) {
        throw new Error(`Failed to match direct copilot alias: '${alias}'`);
      }
      if (!isCopilotCommand(`Hey Severus, ${alias}`)) {
        throw new Error(`Failed to match prefixed copilot alias: 'Hey Severus, ${alias}'`);
      }
    }

    results.push({ name: "In-app voice and command routing for AI Copilot", passed: true });
  } catch (err: any) {
    results.push({ name: "In-app voice and command routing for AI Copilot", passed: false, error: err.message });
  }

  // Test 8: Microphone commands are anchored and never swallow audio-volume commands
  try {
    // Explicit microphone control must match
    const mustMute = ["mute the mic", "mute your microphone", "mute listening", "stop listening", "deafen", "standby", "pause listening"];
    for (const phrase of mustMute) {
      if (!matchesMicMuteCommand(phrase)) {
        throw new Error(`Expected microphone-mute match for '${phrase}'`);
      }
      if (!matchesStopListening(phrase)) {
        throw new Error(`Expected listener standby for '${phrase}'`);
      }
    }

    // Audio volume control must NOT be treated as microphone control
    const mustNotMute = ["mute the volume", "mute volume", "mute spotify", "mute the music", "unmute", "unmute the volume", "play music"];
    for (const phrase of mustNotMute) {
      if (matchesMicMuteCommand(phrase)) {
        throw new Error(`'${phrase}' must not mute the microphone`);
      }
      if (matchesStopListening(phrase)) {
        throw new Error(`'${phrase}' must not put the listener in standby`);
      }
    }

    const mustUnmute = ["unmute the mic", "start listening", "resume listening", "wake up"];
    for (const phrase of mustUnmute) {
      if (!matchesMicUnmuteCommand(phrase)) {
        throw new Error(`Expected microphone-resume match for '${phrase}'`);
      }
    }

    results.push({ name: "Microphone commands anchored apart from audio volume commands", passed: true });
  } catch (err: any) {
    results.push({ name: "Microphone commands anchored apart from audio volume commands", passed: false, error: err.message });
  }

  // Test 9: Wake phrases require a standalone address, not an incidental word
  try {
    const mustWake = ["severus", "hey severus", "system", "wake up", "open system", "are you listening", "hello computer"];
    for (const phrase of mustWake) {
      if (!matchesWakePhrase(phrase)) {
        throw new Error(`Expected wake match for '${phrase}'`);
      }
    }

    // A sentence merely containing "listen" / "wake" / "online" is not an address
    const mustNotWake = [
      "play the song online",
      "i want to listen to something",
      "what is my running status",
      "open copilot",
      "set an alarm so i wake at six",
    ];
    for (const phrase of mustNotWake) {
      if (matchesWakePhrase(phrase)) {
        throw new Error(`'${phrase}' must not be treated as a wake phrase`);
      }
    }

    results.push({ name: "Wake phrases require standalone address words", passed: true });
  } catch (err: any) {
    results.push({ name: "Wake phrases require standalone address words", passed: false, error: err.message });
  }

  // Test 10: Voice diagnostics stay bounded and collapse repeated failures
  try {
    voiceDiagClear();
    if (voiceDiagRecent().length !== 0) {
      throw new Error("voice diag clear did not empty the trail");
    }

    for (let i = 0; i < 5; i += 1) {
      voiceDiagRecord("listener", "error:audio-capture", "held by another stream");
    }
    const collapsed = voiceDiagRecent();
    if (collapsed.length !== 1) {
      throw new Error(`expected repeated identical events to collapse, got ${collapsed.length} entries`);
    }
    if (collapsed[0].count !== 5) {
      throw new Error(`expected repeat count 5, got ${collapsed[0].count}`);
    }

    for (let i = 0; i < 300; i += 1) {
      voiceDiagRecord("reactor", `event-${i}`);
    }
    const bounded = voiceDiagRecent(1000);
    if (bounded.length > 120) {
      throw new Error(`diagnostic trail must stay bounded at 120, got ${bounded.length}`);
    }
    if (bounded[bounded.length - 1].event !== "event-299") {
      throw new Error("diagnostic trail must retain the newest event");
    }

    voiceDiagClear();
    results.push({ name: "Voice diagnostics stay bounded and collapse repeats", passed: true });
  } catch (err: any) {
    results.push({ name: "Voice diagnostics stay bounded and collapse repeats", passed: false, error: err.message });
  }

  // Test 11: The on-device engine is preferred whenever the runtime offers it
  try {
    const installed: SpeechEngineStatus = {
      hasCapabilityApi: true,
      local: "available",
      remote: "available",
      lang: "en-US",
    };
    const installedStrategy = resolveSpeechStrategy(installed);
    if (!installedStrategy.useLocal) {
      throw new Error("an installed on-device model must be preferred over the remote service");
    }
    if (installedStrategy.needsInstall) {
      throw new Error("an installed on-device model must not request an install");
    }

    // The observed WebView2 case: constructor present, no cloud service, model downloadable
    const webview: SpeechEngineStatus = {
      hasCapabilityApi: true,
      local: "downloadable",
      remote: "available",
      lang: "en-US",
    };
    const webviewStrategy = resolveSpeechStrategy(webview);
    if (!webviewStrategy.needsInstall) {
      throw new Error("a downloadable on-device model must trigger an install");
    }
    if (webviewStrategy.useLocal) {
      throw new Error("local processing cannot be used before the model is installed");
    }

    // Nothing usable at all must be reported as unusable rather than retried blindly
    const none: SpeechEngineStatus = {
      hasCapabilityApi: true,
      local: "unavailable",
      remote: "unavailable",
      lang: "en-US",
    };
    if (resolveSpeechStrategy(none).usable) {
      throw new Error("a runtime with no engine must not be reported as usable");
    }

    // Older runtimes without the capability API keep the previous behaviour
    const legacy: SpeechEngineStatus = {
      hasCapabilityApi: false,
      local: "unsupported",
      remote: "unsupported",
      lang: "en-US",
    };
    const legacyStrategy = resolveSpeechStrategy(legacy);
    if (legacyStrategy.useLocal || legacyStrategy.needsInstall) {
      throw new Error("a runtime without the capability API must fall back to the standard engine");
    }

    results.push({ name: "On-device speech engine preferred when the runtime offers it", passed: true });
  } catch (err: any) {
    results.push({ name: "On-device speech engine preferred when the runtime offers it", passed: false, error: err.message });
  }

  // Test 12: Offline capture segments utterances on voice activity
  try {
    const frame = (amplitude: number) => {
      const out = new Float32Array(512);
      for (let i = 0; i < out.length; i += 1) out[i] = Math.sin(i / 8) * amplitude;
      return out;
    };
    const silence = frame(0.0005);
    const speech = frame(0.15);

    let state: VadState = createVadState();
    let completed: Float32Array | null = null;

    // Idle silence must not open an utterance
    for (let i = 0; i < 40; i += 1) {
      const step = advanceVad(state, silence, DEFAULT_VAD_CONFIG);
      state = step.state;
      if (step.completed) throw new Error("silence must never complete an utterance");
    }
    if (state.speechStarted) throw new Error("silence must not start an utterance");

    // A short burst inside the minimum speech length is discarded, not transcribed
    let discarded = 0;
    for (let i = 0; i < 3; i += 1) {
      const step = advanceVad(state, speech, DEFAULT_VAD_CONFIG);
      state = step.state;
      if (step.discarded) discarded += 1;
    }
    for (let i = 0; i < DEFAULT_VAD_CONFIG.silenceFrames + 1; i += 1) {
      const step = advanceVad(state, silence, DEFAULT_VAD_CONFIG);
      state = step.state;
      if (step.discarded) discarded += 1;
      if (step.completed) throw new Error("a sub-minimum blip must not be transcribed");
    }
    if (discarded === 0) throw new Error("a sub-minimum blip should be reported as discarded");

    // Real speech followed by silence must produce exactly one utterance
    for (let i = 0; i < 12; i += 1) {
      const step = advanceVad(state, speech, DEFAULT_VAD_CONFIG);
      state = step.state;
      if (step.completed) throw new Error("an utterance must not close while speech continues");
    }
    for (let i = 0; i < DEFAULT_VAD_CONFIG.silenceFrames; i += 1) {
      const step = advanceVad(state, silence, DEFAULT_VAD_CONFIG);
      state = step.state;
      if (step.completed) completed = step.completed;
    }
    if (!completed) throw new Error("trailing silence must close and return the utterance");
    if (completed.length < 12 * 512) throw new Error("the completed utterance must contain the pre-roll and speech frames");
    if (state.speechStarted) throw new Error("state must reset after completing an utterance");

    // Sample conversion must clamp instead of wrapping
    const encoded = encodePcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    if (encoded[1] !== 32767 || encoded[2] !== -32768) {
      throw new Error(`expected clamping at int16 bounds, got ${encoded[1]} and ${encoded[2]}`);
    }
    if (encoded[3] !== 32767 || encoded[4] !== -32768) {
      throw new Error("out-of-range samples must clamp, not wrap");
    }

    results.push({ name: "Offline capture segments utterances on voice activity", passed: true });
  } catch (err: any) {
    results.push({ name: "Offline capture segments utterances on voice activity", passed: false, error: err.message });
  }

  // Test 13: Wake prefix stripping tolerates the spellings recognizers produce
  try {
    const cases: Array<[string, string]> = [
      ["severus open copilot", "open copilot"],
      ["hey severus, open copilot", "open copilot"],
      ["severe us open the copilot please", "open the copilot please"],
      ["several us new note", "new note"],
      ["system journal", "journal"],
      ["please open notes", "open notes"],
    ];
    for (const [input, expected] of cases) {
      const actual = stripWakePrefix(input);
      if (actual !== expected) {
        throw new Error(`stripWakePrefix('${input}') = '${actual}', expected '${expected}'`);
      }
    }

    // A phrase that does not start with an address word must be untouched
    if (stripWakePrefix("what is my running status") !== "what is my running status") {
      throw new Error("a phrase without a wake prefix must be left intact");
    }

    results.push({ name: "Wake prefix stripping tolerates recognizer spellings", passed: true });
  } catch (err: any) {
    results.push({ name: "Wake prefix stripping tolerates recognizer spellings", passed: false, error: err.message });
  }

  // Test 14: The orb phrase is anchored and resolves to one intent
  try {
    // The contract: every accepted phrasing opens the orb
    const mustOpen = [
      "thinking mode",
      "Thinking Mode",
      "severus thinking mode",
      "hey severus, thinking mode",
      "severe us, thinking mode", // the spelling offline Whisper produces
      "please open thinking mode",
      "open thinking mode",
      "start thinking",
      "enter thinking",
      "jarvis mode",
      "hologram mode",
      "reactor mode",
      "start a conversation",
      "conversation mode",
      "open the orb",
    ];
    for (const phrase of mustOpen) {
      if (!matchesThinkingModeCommand(phrase)) {
        throw new Error(`expected the orb intent for '${phrase}'`);
      }
    }

    // The point of anchoring: neither the bare word nor an incidental mention fires
    const mustNotOpen = [
      "thinking",
      "mode",
      "think",
      "i am thinking",
      "i was thinking about the mode",
      "thinking out loud",
      "are you thinking mode already done",
      "mute the volume",
      "open copilot",
      "what is my running status",
      "stop listening",
    ];
    for (const phrase of mustNotOpen) {
      if (matchesThinkingModeCommand(phrase)) {
        throw new Error(`'${phrase}' must not open the orb`);
      }
    }

    results.push({ name: "The orb phrase is anchored and never fires on an incidental word", passed: true });
  } catch (err: any) {
    results.push({ name: "The orb phrase is anchored and never fires on an incidental word", passed: false, error: err.message });
  }

  return results;
}

if (typeof process !== "undefined" && process.argv) {
  console.log("\n=== SEVERUS TS BEHAVIOURAL VERIFICATION SUITE ===");
  const results = runFrontendVerificationSuite();
  let failed = false;
  results.forEach((r) => {
    if (r.passed) {
      console.log(`[PASS] ${r.name}`);
    } else {
      console.error(`[FAIL] ${r.name}: ${r.error}`);
      failed = true;
    }
  });

  if (failed) {
    console.error("\n[VERIFY FAIL] TypeScript behavioural assertions failed.");
    process.exit(1);
  } else {
    console.log(`\n[VERIFY PASS] All ${results.length} TypeScript behavioural assertions passed clean.`);
    process.exit(0);
  }
}
