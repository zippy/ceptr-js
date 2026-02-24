/**
 * Tree rewriting from match results — "embodiment".
 *
 * Ported from ceptr/src/semtrex.c _t_embody_from_match and _stx_replace.
 *
 * Given match results (capture groups with paths and sibling counts),
 * extract matched portions of a tree and build a new semantic tree
 * with the group symbols as node symbols.
 */

import { type SemanticID, semeq } from './semantic-id.js';
import { type SemNode, newRoot, newNode, newEmpty, newSym, clone, getByPath, nextSibling, addChild, childAt } from './tree.js';
import { type MatchResult, getMatchedNodes } from './semtrex-match.js';
import { SYMBOLS } from './base-defs.js';

/**
 * Embody match results: build a new tree from capture groups.
 *
 * Each capture group becomes a node whose symbol is the group's symbol
 * and whose children are the matched subtrees (cloned).
 */
export function embodyFromMatch(matchResults: MatchResult[], tree: SemNode): SemNode | null {
  if (matchResults.length === 0) return null;

  // If single top-level group, embody it directly
  if (matchResults.length === 1) {
    return embodyGroup(matchResults[0], tree);
  }

  // Multiple top-level groups: wrap in a container
  // Use the first group's symbol as the root (caller can override)
  const root = newRoot(matchResults[0].symbol);
  for (const r of matchResults) {
    const embodied = embodyGroup(r, tree);
    if (embodied) addChild(root, embodied);
  }
  return root;
}

function embodyGroup(result: MatchResult, tree: SemNode): SemNode {
  const groupNode = newRoot(result.symbol);

  if (result.children.length > 0) {
    // Has sub-groups: embody each child group
    for (const child of result.children) {
      const embodied = embodyGroup(child, tree);
      addChild(groupNode, embodied);
    }
  } else {
    // Leaf group: extract matched nodes and clone their surfaces as children
    const nodes = getMatchedNodes(tree, result);
    if (nodes.length === 1 && nodes[0].children.length === 0) {
      // Single leaf match: copy surface directly onto the group node
      groupNode.surface = nodes[0].surface;
    } else {
      // Multiple matched siblings or node with children: clone each
      for (const n of nodes) {
        addChild(groupNode, clone(n));
      }
    }
  }

  return groupNode;
}

/**
 * Find-and-replace in a tree using semtrex.
 *
 * Finds all nodes matching the semtrex pattern and replaces them
 * with clones of the replacement tree.
 *
 * @param semtrex - Parsed semtrex tree
 * @param tree - Target tree to modify in-place
 * @param replacement - Replacement subtree
 * @param matchFn - The match function to use
 */
export function stxReplace(
  tree: SemNode,
  matchFn: (tree: SemNode) => MatchResult[] | null,
  replacement: SemNode,
): void {
  const results = matchFn(tree);
  if (!results || results.length === 0) return;

  for (const result of results) {
    const target = getByPath(tree, result.path);
    if (!target || !target.parent) continue;

    const parent = target.parent;
    const idx = parent.children.indexOf(target);
    if (idx < 0) continue;

    const rep = clone(replacement);
    parent.children[idx] = rep;
    rep.parent = parent;
    target.parent = null;
  }
}

/**
 * Convert match results to a SEMANTIC_MAP tree.
 *
 * The semantic map can be used with template filling to replace SLOT nodes
 * in a template with matched values. Structure:
 *
 *   (SEMANTIC_MAP
 *     (SEMANTIC_LINK
 *       (USAGE:groupSymbol)
 *       (REPLACEMENT_VALUE
 *         ...cloned matched subtree...))
 *     ...)
 *
 * Ported from ceptr/src/semtrex.c _stx_results2sem_map.
 */
export function matchResultsToSemMap(matchResults: MatchResult[], tree: SemNode): SemNode {
  const semMap = newRoot(SYMBOLS.SEMANTIC_MAP);
  buildSemMapEntries(matchResults, tree, semMap);
  return semMap;
}

function buildSemMapEntries(results: MatchResult[], tree: SemNode, semMap: SemNode): void {
  for (const r of results) {
    const link = newEmpty(semMap, SYMBOLS.SEMANTIC_LINK);

    // USAGE: the group's symbol (what this capture represents)
    newSym(link, SYMBOLS.USAGE, r.symbol);

    // REPLACEMENT_VALUE: the matched subtree(s), cloned
    const repVal = newEmpty(link, SYMBOLS.REPLACEMENT_VALUE);
    const nodes = getMatchedNodes(tree, r);
    if (nodes.length === 1 && nodes[0].children.length === 0) {
      // Leaf match: create a node with the matched symbol and surface
      newNode(repVal, nodes[0].symbol, nodes[0].surface);
    } else {
      for (const n of nodes) {
        addChild(repVal, clone(n));
      }
    }

    // Recurse into child captures
    if (r.children.length > 0) {
      buildSemMapEntries(r.children, tree, semMap);
    }
  }
}
