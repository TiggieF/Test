export class MerkleTree {
  constructor(levels) {
    this.levels = levels;
  }

  static async create(values) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('MerkleTree.create requires a non-empty array of values.');
    }

    const normalized = values.map((value) => (value == null ? '' : String(value)));
    const levels = [];

    const leafLevel = await Promise.all(normalized.map((value) => MerkleTree.hashLeaf(value)));
    levels.push(leafLevel);

    let currentLevel = leafLevel;
    while (currentLevel.length > 1) {
      const nextLevelPromises = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] ?? currentLevel[i];
        nextLevelPromises.push(MerkleTree.hashNode(left, right));
      }
      currentLevel = await Promise.all(nextLevelPromises);
      levels.push(currentLevel);
    }

    return new MerkleTree(levels);
  }

  get root() {
    const topLevel = this.levels[this.levels.length - 1];
    return topLevel ? topLevel[0] : undefined;
  }

  get size() {
    return this.levels[0]?.length ?? 0;
  }

  getProof(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new Error('Index is out of bounds for the Merkle tree.');
    }

    const proof = [];
    let currentIndex = index;

    for (let levelIndex = 0; levelIndex < this.levels.length - 1; levelIndex += 1) {
      const level = this.levels[levelIndex];
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;
      const siblingHash = level[siblingIndex] ?? level[currentIndex];

      proof.push({
        position: isRightNode ? 'left' : 'right',
        hash: siblingHash
      });

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  static async verifyProof(value, proof, root) {
    if (!Array.isArray(proof) || !root) {
      return false;
    }

    let computedHash = await MerkleTree.hashLeaf(value == null ? '' : String(value));

    for (const node of proof) {
      if (!node || typeof node.hash !== 'string' || !node.position) {
        return false;
      }

      if (node.position === 'left') {
        computedHash = await MerkleTree.hashNode(node.hash, computedHash);
      } else {
        computedHash = await MerkleTree.hashNode(computedHash, node.hash);
      }
    }

    return computedHash === root;
  }

  static async hashLeaf(value) {
    return MerkleTree.hash(value);
  }

  static async hashNode(left, right) {
    return MerkleTree.hash(`${left}${right}`);
  }

  static async hash(value) {
    const subtle = MerkleTree.getSubtleCrypto();
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const digest = await subtle.digest('SHA-256', data);
    return MerkleTree.bufferToHex(digest);
  }

  static bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  static getSubtleCrypto() {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error('SubtleCrypto API is not available in this environment.');
    }
    return subtle;
  }
}
