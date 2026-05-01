import React from "react";
import {
  Mail,
  UserPlus,
  MessageSquare,
  Phone,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { CHANNEL, type ChannelKind } from "../tokens";

const ICON: Record<ChannelKind, LucideIcon> = {
  email: Mail,
  linkedin_invite: UserPlus,
  linkedin_message: MessageSquare,
  call: Phone,
  wait: Clock,
};

export function ChannelIcon({
  kind,
  size = 11,
  className,
}: {
  kind: ChannelKind;
  size?: number;
  className?: string;
}) {
  const Icon = ICON[kind] ?? Mail;
  return (
    <Icon
      style={{ width: size, height: size, color: CHANNEL[kind].color }}
      className={className}
    />
  );
}

export function ChannelChip({
  kind,
  size = 20,
  iconSize = 10,
  title,
}: {
  kind: ChannelKind;
  size?: number;
  iconSize?: number;
  title?: string;
}) {
  const meta = CHANNEL[kind];
  const Icon = ICON[kind] ?? Mail;
  return (
    <span
      title={title ?? meta.label}
      className="inline-flex items-center justify-center rounded-md"
      style={{
        width: size,
        height: size,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
      }}
    >
      <Icon style={{ width: iconSize, height: iconSize, color: meta.color }} />
    </span>
  );
}