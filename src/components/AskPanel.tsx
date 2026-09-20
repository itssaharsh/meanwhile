import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { freshness, isVerified } from "@/lib/format";
import type { ChatStep, Snapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { EmptyState, LiveDot } from "./primitives";

export type ChatState = "empty" | "none" | "steps" | "streaming" | "answered" | "nochips" | "stopped" | "error";

// ----------------------------------------------------------------------------------------
// Place chip (C-05). Every place an answer names becomes one; a click flies the globe and
// opens that Story (T-05). The teal dot appears only if that place's latest story is verified.
// ----------------------------------------------------------------------------------------
export function PlaceChip({ snapshot: s, now, onPick }: { snapshot: Snapshot; now: number; onPick?: (s: Snapshot) => void }) {
  const verified = isVerified(freshness(s.capturedAt, now));
  return (
    <button
      type="button"
      onClick={() => onPick?.(s)}
      aria-label={ADDED.chatChipAria.text(s.place.name, s.place.country, verified)}
      className={cn(
        "hit-44 mx-0.5 inline-flex h-6 translate-y-[-1px] items-center gap-1.5 rounded-sm border border-line bg-surface-2 px-2 align-middle",
        "[transition:border-color_150ms_var(--ease-out-quint),transform_120ms_var(--ease-out-quint)] hover:border-line-strong active:scale-[.985] motion-reduce:active:scale-100",
      )}
    >
      {verified && <LiveDot />}
      <span className="font-place text-[13px] leading-none font-semibold text-ink">{s.place.name}</span>
    </button>
  );
}

function StepLines({ steps }: { steps: ChatStep[] }) {
  return (
    <ol aria-live="polite" aria-atomic="true" className="m-0 flex list-none flex-col p-0">
      {steps.map((s) => (
        <li
          key={s.label}
          className={cn(
            "flex h-[18px] items-center font-mono text-[11px] tracking-[0.06em] text-ink-muted tnum",
            s.state === "done" && "opacity-50",
          )}
        >
          <span aria-hidden="true" className="mr-2 inline-block size-[3px] shrink-0 bg-line-strong" />
          {s.label}
        </li>
      ))}
    </ol>
  );
}

// C-05 AskPanel — Ask tab of the Dock. Conversation (own scroll), the three suggestion chips
// (always present), and the composer. Named step lines instead of typing dots; never a spinner.
export function AskPanel({
  state,
  question,
  answer,
  steps,
  seconds,
  servedBy,
  places,
  goTo,
  now,
  onAsk,
  onPlace,
  onStop,
  subject,
}: {
  state: ChatState;
  question?: string;
  answer?: string;
  steps?: ChatStep[];
  seconds?: string;
  /** The model that answered. Data, like a source host or a score — not copy: the answer says
   *  who produced it, because "an AI said so" is not an attribution. */
  servedBy?: string | null;
  /** snapshotId → snapshot, for turning #place: links into chips. */
  places: Record<string, Snapshot>;
  /** The GO TO fallback when an answer names places the resolver could not match. */
  goTo?: Snapshot[];
  now: number;
  onAsk?: (text: string) => void;
  onPlace?: (s: Snapshot) => void;
  onStop?: () => void;
  /** The place the question will be about. Shown only when it is not the frame on air, because
   *  that is the only case where COPY §6's placeholder would be misleading. */
  subject?: { place: string; onAir: boolean } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const streaming = state === "steps" || state === "streaming";

  const components: ComponentProps<typeof MessageResponse>["components"] = {
    a: ({ href, children }) => {
      const id = href?.startsWith("#place:") ? href.slice("#place:".length) : null;
      const s = id ? places[id] : null;
      if (s) return <PlaceChip snapshot={s} now={now} onPick={onPlace} />;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-[3px]">
          {children}
        </a>
      );
    },
  };

  const summary = steps && seconds && (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="self-start font-mono text-[10px] text-ink-muted tnum"
      >
        {ADDED.chatSummary.text(steps.length, seconds)}
      </button>
      {servedBy && (
        <span className="font-mono text-[10px] tracking-[0.06em] text-ink-muted uppercase" title={servedBy}>
          {servedBy}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 overflow-y-auto">
        <ConversationContent className="gap-4 px-4 pt-4 pb-2">
          {state === "empty" && (
            <EmptyState kind="first" region="chat" title={ADDED.chatFirstTitle.text} body={ADDED.chatFirstBody.text} className="p-0 pt-6" />
          )}
          {state === "none" && (
            <EmptyState
              kind="none"
              region="chat"
              title={ADDED.chatNoneTitle.text}
              body={ADDED.chatNoneBody.text}
              action={{ label: ADDED.chatNoneAction.text }}
              className="p-0 pt-6"
            />
          )}

          {question && state !== "empty" && state !== "none" && (
            <Message from="user">
              <MessageContent>{question}</MessageContent>
            </Message>
          )}

          {state === "steps" && steps && (
            <Message from="assistant">
              <MessageContent>
                <StepLines steps={steps} />
              </MessageContent>
            </Message>
          )}

          {(state === "streaming" || state === "answered" || state === "nochips" || state === "stopped") && answer && (
            <Message from="assistant" aria-busy={state === "streaming" || undefined}>
              <MessageContent>
                {summary}
                {expanded && steps && <StepLines steps={steps.map((s) => ({ ...s, state: "done" }))} />}
                <MessageResponse components={components}>{answer}</MessageResponse>
                {state === "stopped" && <span className="font-mono text-[10px] text-ink-muted">{ADDED.chatStopped.text}</span>}
                {state === "nochips" && goTo && goTo.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="mr-1 font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">{ADDED.chatGoTo.text}</span>
                    {goTo.slice(0, 3).map((s) => (
                      <PlaceChip key={s.snapshotId} snapshot={s} now={now} onPick={onPlace} />
                    ))}
                  </div>
                )}
              </MessageContent>
            </Message>
          )}

          {state === "error" && (
            <Message from="assistant">
              <MessageContent>
                <div role="alert" className="flex flex-col gap-1.5 border-l-2 border-danger pl-3">
                  <p className="m-0 font-sans text-[14px] text-ink">{COPY.chat.errorTitle}</p>
                  <p className="m-0 font-sans text-[14px] text-ink">{COPY.chat.errorBody}</p>
                  <Button variant="text" size="md" className="self-start" onClick={() => question && onAsk?.(question)}>
                    {COPY.chat.errorAction}
                  </Button>
                </div>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
      </Conversation>

      <Suggestions>
        {COPY.chat.chips.map((c) => (
          <Suggestion key={c} suggestion={c} onClick={(t) => onAsk?.(t)} />
        ))}
      </Suggestions>

      {subject && !subject.onAir && (
        <p className="shrink-0 bg-surface-1 px-4 pt-1 font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
          {ADDED.askSubject.text(subject.place)}
        </p>
      )}

      <div className="shrink-0 bg-surface-1 px-4 pb-4 max-sm:pb-[calc(16px+env(safe-area-inset-bottom))]">
        <PromptInput onSubmit={({ text }) => onAsk?.(text)}>
          <PromptInputTextarea
            value={state === "error" ? question ?? draft : draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={COPY.chat.placeholder}
            rows={1}
            className="max-h-[calc(4lh+20px)] min-h-11 px-3 py-2.5 font-sans text-[14px] leading-[1.5] text-ink placeholder:text-ink-muted max-sm:min-h-12 max-sm:text-[16px]"
          />
          <InputGroupAddon align="inline-end" className="self-end pb-1.5">
            {streaming ? (
              <Button variant="text" size="md" onClick={onStop} className="h-8 rounded-sm bg-surface-2 px-2 text-danger">
                {ADDED.chatStop.text}
              </Button>
            ) : (
              <Button
                type="submit"
                variant="text"
                size="md"
                disabled={draft.trim().length === 0 && state !== "error"}
                className="h-8 px-2"
              >
                {ADDED.chatSend.text}
              </Button>
            )}
          </InputGroupAddon>
        </PromptInput>
      </div>
    </div>
  );
}
