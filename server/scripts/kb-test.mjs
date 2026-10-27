import assert from "node:assert/strict";
import vm from "node:vm";
import { entries, topics } from "../src/bot/knowledge/index.js";
import { createKnowledgeResponder, findEntry, normalize } from "../src/bot/knowledge/matcher.js";
import { getBuddyReply } from "../src/bot/buddy.js";

const quotas = { dsa: 70, javascript: 40, react: 25, webdev: 45, backend: 35, "cs-basics": 20 };
for (const [file, minimum] of Object.entries(quotas)) {
  const { default: data } = await import(`../src/bot/knowledge/${file}.js`);
  assert.ok(data.length >= minimum, `${file}: minimum ${minimum}`);
  console.log(`${file}.js: ${data.length}`);
}
assert.ok(entries.length >= 200);
const ids = new Set(), primaries = new Set();
for (const entry of entries) {
  assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(!ids.has(entry.id), `Duplicate ID: ${entry.id}`); ids.add(entry.id);
  assert.ok(entry.topic?.trim() && entry.title?.trim(), entry.id);
  assert.ok(entry.keywords.length && entry.keywords.every(k => k.trim() && k === k.toLowerCase()), entry.id);
  assert.ok(!primaries.has(entry.keywords[0]), `Duplicate primary: ${entry.id}`); primaries.add(entry.keywords[0]);
  assert.ok(entry.answer.length > 0 && entry.answer.length <= 900, `${entry.id}: answer length ${entry.answer.length}`);
  assert.ok(entry.more === undefined || (entry.more.length > 0 && entry.more.length <= 700), `${entry.id}: more length`);
  for (const value of [entry.answer, entry.more].filter(Boolean)) {
    assert.equal((value.match(/```/g) || []).length % 2, 0, `${entry.id}: unbalanced fences`);
    assert.ok(!/^#{1,6}\s/m.test(value), `${entry.id}: no headings`);
  }
  if (entry.topic === "dsa") assert.match(entry.answer, /O\(/, `${entry.id}: complexity`);
  const found = findEntry(entry.keywords[0]);
  assert.ok(found?.id === entry.id || (found?.topic === entry.topic && found.keywords.includes(entry.keywords[0])), `${entry.id} retrieved ${found?.id}`);
}
assert.equal(Object.values(topics).flat().length, entries.length);
const probes = [
  ["what is a closure", "js-closure"], ["explain binary search", "dsa-binary-search"],
  ["difference between let and const", "js-var-let-const"], ["what is cors", "web-cors"],
  ["bfs vs dfs", "dsa-bfs-vs-dfs"], ["time complexity of quicksort", "dsa-quicksort"],
  ["jwt", "backend-jwt"], ["flexbox", "web-flexbox"], ["useEffect cleanup", "react-useeffect"],
  ["what is a trie", "dsa-trie"], ["explain a binary search tree", "dsa-bst"],
  ["how does event delegation work", "js-delegation"], ["what is memoization", "dsa-memoization"],
  ["explain the temporal dead zone", "js-tdz"], ["what is middleware", "backend-middleware"],
  ["how does bcrypt work", "backend-bcrypt"], ["explain css grid", "web-grid"],
  ["what is polymorphism", "cs-polymorphism"], ["how does union-find work", "dsa-union-find"],
  ["what are core web vitals", "web-vitals"], ["what does optional chaining do", "js-optional-chaining"],
  ["explain react keys", "react-keys"], ["what is a deadlock", "cs-deadlock"],
  ["how do I use cursor pagination", "backend-pagination"], ["explain o(n)", "dsa-big-o"],
];
for (const [text, id] of probes) assert.equal(findEntry(text)?.id, id, text);
for (const text of ["hii", "how are you", "thanks", "ass", "what time is it", "a", "is", "time", "add", "xssomething", "classification"]) assert.equal(findEntry(text), null, text);
assert.equal(normalize("  Hello, WORLD!  "), "hello world");
console.log("PASS - unique entries, lengths, fences, self-retrieval, 25 probes and negative probes");

// Execute every built-in JS snippet in an isolated Node VM. Tests never evaluate chat input.
const examples = {
  "dsa-singly-linked-list": "prepend(null, 2).value === 2",
  "dsa-stack": "stackExample() === 2", "dsa-hash-set": "JSON.stringify(unique([1,1,2])) === '[1,2]'",
  "dsa-inorder": "JSON.stringify(inorder({value:2,left:{value:1},right:{value:3}})) === '[1,2,3]'",
  "dsa-preorder": "JSON.stringify(preorder({value:2,left:{value:1},right:{value:3}})) === '[2,1,3]'",
  "dsa-postorder": "JSON.stringify(postorder({value:2,left:{value:1},right:{value:3}})) === '[1,3,2]'",
  "dsa-recursion": "factorial(5) === 120", "dsa-knapsack": "knapsack([[2,3],[3,4],[4,5]],5) === 7",
  "dsa-lis": "lis([3,1,2,2,4]) === 3 && lis([]) === 0", "dsa-lcs": "lcs('abcde','ace') === 3",
  "dsa-coin-change": "coinChange([1,3,4],6) === 2 && coinChange([2],3) === -1",
  "dsa-fibonacci": "fibonacci(10) === 55 && fibonacci(0) === 0",
  "dsa-two-pointers": "hasPair([1,3,5],8) && !hasPair([1,3,5],7)",
  "dsa-sliding-window": "maxWindow([-3,-1,-2],2) === -3",
  "dsa-prefix-sum": "JSON.stringify(prefix([2,-1,3])) === '[0,2,1,4]'",
  "dsa-binary-search": "binarySearch([1,3,5],3) === 1 && binarySearch([],1) === -1 && binarySearch([1,3],2) === -1",
  "dsa-bubble-sort": "JSON.stringify(bubbleSort([3,1,2,1])) === '[1,1,2,3]'",
  "dsa-selection-sort": "JSON.stringify(selectionSort([3,1,2,1])) === '[1,1,2,3]'",
  "dsa-insertion-sort": "JSON.stringify(insertionSort([3,1,2,1])) === '[1,1,2,3]'",
  "dsa-merge-sort": "JSON.stringify(mergeSort([3,1,2,1])) === '[1,1,2,3]'",
  "dsa-bit-manipulation": "isOdd(3) && !isOdd(4)",
  "dsa-cycle-detection": "(()=>{ const x={next:null}; const plain=!hasCycle(x); x.next=x; return plain && hasCycle(x); })()",
  "dsa-kadane": "kadane([-3,-1,-2]) === -1 && kadane([-2,3,-1,4]) === 6",
  "dsa-two-sum": "JSON.stringify(twoSum([2,7,11],9)) === '[0,1]' && twoSum([2],4) === null",
  "dsa-reverse-list": "(()=>{ const r=reverseList({value:1,next:{value:2,next:null}}); return r.value===2 && r.next.value===1 && r.next.next===null; })()",
  "dsa-valid-parentheses": "validBrackets('a{[()]}') && !validBrackets('([)]') && !validBrackets('(')",
  "dsa-linear-search": "linearSearch([4,5],5) === 1 && linearSearch([],1) === -1",
  "dsa-lower-bound": "lowerBound([1,2,2,4],2) === 1 && lowerBound([],1) === 0",
  "dsa-palindrome": "isPalindrome('abba') && !isPalindrome('ab')",
  "dsa-gcd": "gcd(48,18) === 6", "dsa-sieve": "sieve(10).map((v,i)=>v?i:0).filter(Boolean).join(',') === '2,3,5,7'",
  "dsa-fast-power": "power(2,10) === 1024 && power(3,0) === 1",
  "dsa-frequency": "frequencies(['a','b','a']).get('a') === 2",
  "dsa-anagram": "anagram('listen','silent') && !anagram('ab','aa')",
  "dsa-intervals": "JSON.stringify(mergeIntervals([[3,5],[1,3],[8,9]])) === '[[1,5],[8,9]]'",
  "dsa-monotonic-stack": "JSON.stringify(nextGreater([2,1,3])) === '[3,3,-1]'",
  "dsa-tree-height": "height(null) === 0 && height({left:{},right:null}) === 2",
  "js-closure": "(()=>{ const c=counter(), d=counter(); return c()===1 && c()===2 && d()===1; })()",
  "js-arrow": "double(4) === 8", "js-class": "new Point(2,3).sum() === 5",
  "js-async": "sumAsync(2,3).then(x=>x===5)", "js-map": "squares([2,3]).join(',') === '4,9'",
  "js-filter": "positives([-1,0,2]).join(',') === '2'", "js-reduce": "sum([]) === 0 && sum([2,3]) === 5",
  "js-destructuring": "getName() === 'Guest' && getName({name:'Ada'}) === 'Ada'",
  "js-spread": "append([1],2).join(',') === '1,2'", "js-rest": "total(1,2,3) === 6",
  "js-debounce": "typeof debounce(()=>{},10) === 'function'", "js-throttle": "(()=>{ let n=0; const f=throttle(()=>++n,1000); f(); f(); return n===1; })()",
  "js-optional-chaining": "city(null) === 'Unknown' && city({address:{city:'Paris'}}) === 'Paris'",
  "js-currying": "addCurried(2)(3) === 5", "js-generators": "[...countTo(3)].join(',') === '1,2,3'",
};
let snippets = 0, dsaSnippets = 0;
for (const entry of entries) {
  for (const match of entry.answer.matchAll(/```js\n([\s\S]*?)```/g)) {
    assert.ok(examples[entry.id], `Missing runnable example: ${entry.id}`);
    const context = vm.createContext({ setTimeout, clearTimeout });
    const result = new vm.Script(`${match[1]}\n;(${examples[entry.id]})`).runInContext(context, { timeout: 1000 });
    assert.equal(await result, true, entry.id);
    snippets++; if (entry.topic === "dsa") dsaSnippets++;
  }
}
assert.ok(dsaSnippets >= Math.floor(entries.filter(e => e.topic === "dsa").length / 2));
console.log(`PASS - executed ${snippets} JavaScript snippets (${dsaSnippets} DSA)`);

let time = 0;
const responder = createKnowledgeResponder({ now: () => time, random: () => 0, ttl: 100, cap: 2 });
const first = entries[0];
assert.match(responder.command("more", "a"), /concept first/);
assert.equal(responder.remember(first, "a"), first.answer);
assert.notEqual(responder.command("more", "a"), responder.command("more", "b"));
time = 101;
assert.match(responder.command("more", "a"), /concept first/);
responder.remember(first, "a"); responder.remember(first, "b"); responder.remember(first, "c");
assert.match(responder.command("more", "a"), /concept first/); // LRU capacity eviction
const random = createKnowledgeResponder({ random: () => 0 });
const seen = new Set(Array.from({ length: entries.length }, () => random.command("random", "one")));
assert.equal(seen.size, entries.length, "No random repeats until exhaustion");
assert.equal(random.command("random", "one"), first.answer, "New cycle after exhaustion");
assert.match(random.command("quiz me", "quiz"), /^What is /);
assert.match(random.command("answer", "other"), /Type quiz me/);
assert.equal(random.command("answer", "quiz"), first.answer);
assert.match(random.command("answer", "quiz"), /Type quiz me/);
assert.match(getBuddyReply("hii", "rules", { variant: 0 }), /^Hello/);
assert.match(getBuddyReply("binary search", "rules"), /O\(log n\)/);
assert.match(getBuddyReply("help", "rules"), /topics.*quiz me.*random/);
assert.match(getBuddyReply("not a known request", "rules"), /topics.*dsa/);
for (const area of Object.keys(topics)) assert.ok(getBuddyReply(area, "rules").endsWith("Type any concept name to learn it"));
console.log("PASS - commands, per-user isolation, random exhaustion, quiz reveal, TTL and capacity eviction");
console.log(`Total: ${entries.length} entries. All knowledge-base checks passed`);
