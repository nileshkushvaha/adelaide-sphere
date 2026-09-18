import { ARTIFACT_LIMITS, artifactHash, artifactProblems, type ArticleArtifact } from './apply.js';
import { postMaterialHash, type MaterialPost } from '../editorial/material.js';

const valid: ArticleArtifact = {
  title: 'Adelaide Central Market guide',
  slug: 'adelaide-central-market-guide',
  excerpt: null,
  bodyMarkdown: 'Body text.',
  bodyFormat: 'markdown',
  authorId: 'cmauthor000000000000000',
  categoryId: 'cmcategory00000000000000',
  tagIds: [],
};

describe('generation artifact validation (maps only onto existing Post fields)', () => {
  it('accepts a complete artifact', () => {
    expect(artifactProblems(valid)).toEqual([]);
  });

  it('names every field that is missing, unsafe or over the Post column limit', () => {
    expect(artifactProblems(null)).toEqual(['artifact']);
    expect(artifactProblems([])).toEqual(['artifact']);
    expect(artifactProblems({ ...valid, title: ' ', slug: 'Not A Slug', bodyFormat: 'docx', tagIds: 'x' })).toEqual(['title', 'slug', 'bodyFormat', 'tagIds']);
    expect(artifactProblems({ ...valid, title: 'x'.repeat(ARTIFACT_LIMITS.title + 1) })).toEqual(['title']);
    expect(artifactProblems({ ...valid, bodyMarkdown: 'x'.repeat(ARTIFACT_LIMITS.body + 1) })).toEqual(['bodyMarkdown']);
    expect(artifactProblems({ ...valid, tagIds: Array.from({ length: ARTIFACT_LIMITS.tags + 1 }, (_, i) => `t${i}`) })).toEqual(['tagIds']);
    expect(artifactProblems({ ...valid, seoDescription: 'x'.repeat(ARTIFACT_LIMITS.seoDescription + 1) })).toEqual(['seoDescription']);
    expect(artifactProblems({ ...valid, authorId: undefined })).toEqual(['authorId']);
  });

  it('hashes an artifact deterministically for run identity', () => {
    expect(artifactHash(valid)).toBe(artifactHash({ ...valid }));
    expect(artifactHash(valid)).not.toBe(artifactHash({ ...valid, title: 'Different' }));
  });
});

describe('article material hash (approval and CAS binding)', () => {
  const post: MaterialPost = {
    title: 'T', slug: 's', excerpt: 'e', bodyFormat: 'html', bodyMarkdown: '<p>b</p>', seoTitle: null, seoDescription: null, seoKeywords: null,
    authorId: 'a', categoryId: 'c', coverMediaId: null, coverAlt: null, ogImageMediaId: null, guestPost: false,
  };
  it('ignores tag order and duplicates but changes with any material field', () => {
    expect(postMaterialHash(post, ['b', 'a', 'a'])).toBe(postMaterialHash(post, ['a', 'b']));
    const base = postMaterialHash(post, []);
    for (const change of [{ title: 'T2' }, { slug: 's2' }, { excerpt: 'e2' }, { bodyMarkdown: '<p>c</p>' }, { seoTitle: 'x' }, { categoryId: 'c2' }, { coverMediaId: 'm' }, { guestPost: true }]) {
      expect(postMaterialHash({ ...post, ...change }, [])).not.toBe(base);
    }
    expect(postMaterialHash(post, ['t'])).not.toBe(base);
  });
});
