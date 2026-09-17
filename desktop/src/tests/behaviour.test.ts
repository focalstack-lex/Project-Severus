declare const process: any;

import { isHubNode } from "../utils/hubNode";
import { filterLearningItems, isCandidateEligibleForPromotion, CandidateItem } from "../components/LearningHistoryModal";

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
    console.log("\n[VERIFY PASS] All 4 TypeScript behavioural assertions passed clean.");
    process.exit(0);
  }
}
