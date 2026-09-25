import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { CircleNotch } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Avatar } from "@anlg/ui/components/avatar";

import { MessageBubble, MessageContainer } from "./shared";

import { normalizeAgentAvatarSeed } from "~/chat/agent-avatar";
import { useCurrentChatModelLabel } from "~/chat/components/model-switcher";
import { useConfigValue } from "~/shared/config";

const LOADING_MESSAGE_INTERVAL_MS = 2200;

export function LoadingMessage() {
  const agentAvatarSeed = normalizeAgentAvatarSeed(
    useConfigValue("agent_avatar_seed"),
  );
  const model = useCurrentChatModelLabel();

  // Translation functions require the locale to already be active, so this
  // pool must be built at render time, not module scope (mirrors the
  // suggestion pools in body/empty.tsx).
  const loadingMessages = [
    t`Thinking...`,
    t`Reading through the transcript...`,
    t`Pondering...`,
    t`Searching for relevant context...`,
    t`Connecting the dots...`,
    t`Almost there...`,
  ];

  const [messageIndex, setMessageIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((current) => (current + 1) % loadingMessages.length);
    }, LOADING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(interval);
    // The pool is a fixed-length constant rebuilt fresh each render; cycling
    // is purely index-based and doesn't need to depend on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MessageContainer align="start">
      <MessageBubble variant="loading">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Avatar seed={agentAvatarSeed} label="" size={16} />
            <CircleNotch className="h-4 w-4 animate-spin" />
            <span className="text-sm">
              {loadingMessages[messageIndex % loadingMessages.length]}
            </span>
          </div>
          {model ? (
            <p className="text-muted-foreground pl-[1.75rem] text-[11px]">
              <Trans>
                Powered by: {model.providerDisplayName} {model.modelId}
              </Trans>
            </p>
          ) : null}
        </div>
      </MessageBubble>
    </MessageContainer>
  );
}
