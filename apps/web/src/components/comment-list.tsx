'use client';

import { useState } from 'react';
import type { PublicComment } from '@/lib/api';
import { formatArticleDate } from '@/lib/share';
import { CommentForm } from './comment-form';

/** What a reply form needs; null when comments are closed, which hides every Reply button. */
export interface ReplyFormSettings {
  turnstileSiteKey: string | null;
  guidelinesHref: string | null;
  privacyHref: string | null;
}

interface Replying {
  /** The top-level comment whose thread the reply joins. */
  threadId: string;
  /** The comment the reader pressed Reply on. */
  commentId: string;
  name: string;
}

function CommentItem({ comment, small, canReply, active, onReply }: { comment: PublicComment; small?: boolean; canReply: boolean; active: boolean; onReply: () => void }) {
  return (
    <div className="flex gap-3.5 sm:gap-4">
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-full font-semibold ${small ? 'size-8 text-xs' : 'size-10 text-sm'} ${comment.staff ? 'bg-sky-700 text-white' : 'bg-sky-50 text-sky-700'}`}
      >
        {comment.displayName.trim().slice(0, 1).toUpperCase() || '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold">{comment.displayName}</span>
          {comment.staff && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">Team</span>}
          <time dateTime={comment.createdAt} className="text-sm text-text-muted">
            {formatArticleDate(comment.createdAt)}
          </time>
        </p>
        <p className="mt-1.5 whitespace-pre-line break-words leading-relaxed">{comment.text}</p>
        {comment.redacted && <p className="mt-1.5 text-xs text-text-muted">This comment was edited by our moderators.</p>}
        {canReply && (
          <button type="button" onClick={onReply} aria-expanded={active} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-2 hover:underline">
            Reply<span className="sr-only"> to {comment.displayName}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Approved comments and their replies, oldest first (SRS COM 001–002, 1.10:
 * two levels). The API publishes a display name, the text and the time only —
 * no email address and no moderation metadata. Replying to a reply adds to the
 * same thread, so the conversation never nests deeper than one indent. Every
 * reply is moderated before it appears, as comments are.
 */
export function CommentList({ comments, postId, pageCount, replyForm }: { comments: PublicComment[]; postId: string; pageCount: number; replyForm: ReplyFormSettings | null }) {
  const [replying, setReplying] = useState<Replying | null>(null);
  // Later pages of comments (20 threads each), loaded when asked for.
  const [more, setMore] = useState<PublicComment[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState<'idle' | 'loading' | 'failed'>('idle');
  if (comments.length === 0) return null;
  const threads = [...comments, ...more];

  const loadMore = async () => {
    setLoading('loading');
    try {
      const response = await fetch(`/api/v1/posts/${encodeURIComponent(postId)}/comments?page=${page + 1}&pageSize=20`, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { data: PublicComment[] };
      const shown = new Set(threads.map((thread) => thread.id));
      setMore((current) => [...current, ...body.data.filter((thread) => !shown.has(thread.id))]);
      setPage((current) => current + 1);
      setLoading('idle');
    } catch {
      setLoading('failed');
    }
  };
  const toggle = (next: Replying) => setReplying((current) => (current?.commentId === next.commentId ? null : next));

  return (
    <>
    <ul className="flex flex-col divide-y divide-border">
      {threads.map((comment) => {
        const formHere = replying?.threadId === comment.id && replyForm !== null;
        return (
          <li key={comment.id} className="py-5 first:pt-0">
            <CommentItem
              comment={comment}
              canReply={replyForm !== null}
              active={replying?.commentId === comment.id}
              onReply={() => toggle({ threadId: comment.id, commentId: comment.id, name: comment.displayName })}
            />
            {(comment.replies.length > 0 || formHere) && (
              <ul aria-label={`Replies to ${comment.displayName}`} className="mt-4 flex flex-col gap-4 border-l-2 border-border pl-4 sm:ml-5 sm:pl-6">
                {comment.replies.map((reply) => (
                  <li key={reply.id}>
                    <CommentItem
                      comment={reply}
                      small
                      canReply={replyForm !== null}
                      active={replying?.commentId === reply.id}
                      onReply={() => toggle({ threadId: comment.id, commentId: reply.id, name: reply.displayName })}
                    />
                  </li>
                ))}
                {formHere && replying && (
                  <li>
                    <CommentForm
                      key={replying.commentId}
                      postId={postId}
                      parentId={replying.commentId}
                      replyingTo={replying.name}
                      onCancel={() => setReplying(null)}
                      turnstileSiteKey={replyForm.turnstileSiteKey}
                      guidelinesHref={replyForm.guidelinesHref}
                      privacyHref={replyForm.privacyHref}
                    />
                  </li>
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
    {page < pageCount && (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading === 'loading'}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold transition-colors hover:border-border-strong hover:bg-sky-50 disabled:opacity-60"
        >
          {loading === 'loading' ? 'Loading comments…' : 'Show more comments'}
        </button>
        <p role="status" className="text-sm text-text-muted">
          {loading === 'failed' ? 'Those comments could not be loaded. Please try again.' : ''}
        </p>
      </div>
    )}
    </>
  );
}
