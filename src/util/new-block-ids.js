const uid = require('./uid');

/**
 * Mutate the given blocks to have new IDs and update all internal ID references.
 * Does not return anything to make it clear that the blocks are updated in-place.
 * @param {array} blocks - blocks to be mutated.
 * @param {Array<{id: string, blockId: string}>} [comments] - comments that travel
 *     with the blocks (e.g. backpack / cross-sprite payloads). Their own ids and
 *     their `blockId` references are remapped in lockstep so a comment still
 *     points at the block it was attached to after the blocks are re-identified.
 */
module.exports = (blocks, comments) => {
    const oldToNew = {};

    // First update all top-level IDs and create old-to-new mapping
    for (let i = 0; i < blocks.length; i++) {
        const newId = uid();
        const oldId = blocks[i].id;
        blocks[i].id = oldToNew[oldId] = newId;
    }

    // Then go back through and update inputs (block/shadow)
    // and next/parent properties
    for (let i = 0; i < blocks.length; i++) {
        for (const key in blocks[i].inputs) {
            const input = blocks[i].inputs[key];
            input.block = oldToNew[input.block];
            input.shadow = oldToNew[input.shadow];
        }
        if (blocks[i].parent) {
            blocks[i].parent = oldToNew[blocks[i].parent];
        }
        if (blocks[i].next) {
            blocks[i].next = oldToNew[blocks[i].next];
        }
    }

    // Comments are referenced in both directions: a block keeps a `comment`
    // field pointing at the comment id, and the comment keeps a `blockId`
    // pointing back at the block. Rewrite both, otherwise a re-import into the
    // same target would collide with the original comment id (createComment
    // refuses to overwrite an existing id) and the note would never reappear.
    if (comments) {
        const commentOldToNew = {};
        for (const comment of comments) {
            const newId = uid();
            commentOldToNew[comment.id] = newId;
            comment.id = newId;
            if (Object.prototype.hasOwnProperty.call(oldToNew, comment.blockId)) {
                comment.blockId = oldToNew[comment.blockId];
            }
        }
        for (let i = 0; i < blocks.length; i++) {
            if (blocks[i].comment && commentOldToNew[blocks[i].comment]) {
                blocks[i].comment = commentOldToNew[blocks[i].comment];
            }
        }
    }
};
