import { webcrypto } from 'node:crypto';
import { MerkleTree } from './merkle.js';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

async function runTests() {
  await testDeterministicRoot();
  await testProofVerification();
  await testTamperingDetection();
  console.log('All Merkle tree tests passed.');
}

async function testDeterministicRoot() {
  const values = ['AAPL|189.57', 'AAPL|189.62', 'AAPL|189.71'];
  const treeA = await MerkleTree.create(values);
  const treeB = await MerkleTree.create(values);
  assert(treeA.root === treeB.root, 'Merkle roots should be deterministic for the same data set.');
}

async function testProofVerification() {
  const values = ['alpha', 'beta', 'gamma', 'delta'];
  const tree = await MerkleTree.create(values);
  const index = 2;
  const proof = tree.getProof(index);
  const verified = await MerkleTree.verifyProof(values[index], proof, tree.root);
  assert(verified, 'Merkle proof should verify the provided leaf.');
}

async function testTamperingDetection() {
  const values = ['node-1', 'node-2', 'node-3'];
  const tree = await MerkleTree.create(values);
  const proof = tree.getProof(1);
  const verified = await MerkleTree.verifyProof('node-999', proof, tree.root);
  assert(!verified, 'Merkle proof verification should fail for tampered data.');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

await runTests();
