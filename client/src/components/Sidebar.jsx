import { useState } from "react";
import { LogOut, MessageCircle, Search, X } from "lucide-react";
import Avatar from "./Avatar";
import { ListSkeleton } from "./Skeletons";
import { formatListTime, getOther } from "../utils/format";
import ThemeToggle from "./ThemeToggle";

const actionClass = "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary-ink transition-colors duration-150 hover:bg-surface-2 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted";

export default function Sidebar({ className, me, conversations, activeId, onSelectConversation, onSelectUser,
  users, friends, requests, socialError, onRetrySocial, onFriendAction, busy,
  usersLoading, convsLoading, convsError, usersError, onRetryConversations, onRetryUsers,
  onlineIds, query, onQueryChange, onLogout }) {
  const [tab, setTab] = useState("chats");
  const searching = query.trim().length >= 2;
  const entries = conversations.map((conversation) => ({ user: getOther(conversation, me._id), conversation })).filter((entry) => entry.user);
  const existing = new Set(entries.map((entry) => entry.user._id));
  for (const user of friends) if (!existing.has(user._id)) entries.push({ user });
  entries.sort((a, b) => {
    if (!!a.user.isBot !== !!b.user.isBot) return a.user.isBot ? -1 : 1;
    const timeA = a.conversation?.lastMessage?.createdAt;
    const timeB = b.conversation?.lastMessage?.createdAt;
    if (timeA || timeB) return new Date(timeB || 0) - new Date(timeA || 0);
    return a.user.name.localeCompare(b.user.name);
  });
  const chooseTab = (value) => { setTab(value); onQueryChange(""); };
  const retryState = (error, action, label) => <div role="alert" className="space-y-2 px-4 py-3 text-sm">
    <p className="text-danger-ink">{error}</p><button onClick={action} className="font-medium text-primary-ink hover:underline">{label}</button>
  </div>;

  return (
    <aside className={`panel min-w-0 shrink-0 flex-col overflow-hidden border border-border bg-surface md:rounded-2xl   ${className}`}>
      <div className="space-y-4 bg-header p-4 pb-0">
        <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center brand-gradient rounded-xl text-on-primary"><MessageCircle className="h-5 w-5" /></div><span className="text-lg font-semibold text-text">MERN Chat</span></div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input aria-label="Search people" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search people by name or email" className="w-full rounded-full border border-border bg-input py-2.5 pl-9 pr-8 text-sm text-text outline-none transition-colors duration-150 focus:border-primary focus:ring-[3px] focus:ring-primary/20" />
          {query && <button onClick={() => onQueryChange("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-muted"><X className="h-4 w-4" /></button>}
        </div>
        {!searching && <p className="text-xs text-muted">Type at least 2 characters to find friends.</p>}
        <div role="tablist" aria-label="Friends and chats" className="flex gap-2 border-b border-border">
          <button role="tab" aria-selected={tab === "chats"} onClick={() => chooseTab("chats")} className={`flex-1 rounded-t-lg px-3 py-2 text-sm font-medium ${tab === "chats" ? "border-b-2 border-primary text-primary-ink " : "text-muted "}`}>Chats</button>
          <button role="tab" aria-selected={tab === "requests"} onClick={() => chooseTab("requests")} className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium ${tab === "requests" ? "border-b-2 border-primary text-primary-ink " : "text-muted "}`}>Requests {requests.incoming.length > 0 && <span aria-label={`${requests.incoming.length} incoming friend requests`} className="rounded-full bg-danger-fill px-1.5 text-xs text-on-primary">{requests.incoming.length}</span>}</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {socialError && retryState(socialError, onRetrySocial, "Retry friend requests")}
        {searching ? (
          usersLoading ? <ListSkeleton rows={3} /> : usersError ? retryState(usersError, onRetryUsers, "Retry search") : users.length === 0 ? <p className="px-4 py-3 text-sm text-muted">No users match your search.</p> :
          <ul aria-label="Search results">{users.map((user) => <li key={user._id} className="space-y-2 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3"><Avatar name={user.name} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-base font-semibold">{user.name}</p><p className="truncate text-xs text-muted">{user.maskedEmail}</p></div></div>
            <div className="flex flex-wrap gap-2">
              {user.relationship === "none" && <button disabled={busy} onClick={() => onFriendAction("add", user._id)} className={actionClass}>Add</button>}
              {user.relationship === "friends" && <button onClick={() => onSelectUser(user)} className={actionClass}>Friends</button>}
              {user.relationship === "request_sent" && <><button disabled className={actionClass}>Pending</button><button disabled={busy} onClick={() => onFriendAction("cancel", user.requestId)} className={actionClass}>Cancel</button></>}
              {user.relationship === "request_received" && <><button disabled={busy} onClick={() => onFriendAction("accept", user.requestId)} className={actionClass}>Accept</button><button disabled={busy} onClick={() => onFriendAction("decline", user.requestId)} className={actionClass}>Decline</button></>}
            </div>
          </li>)}</ul>
        ) : tab === "requests" ? (
          <div className="space-y-4 px-4 py-3">
            {[["Incoming", requests.incoming], ["Outgoing", requests.outgoing]].map(([label, items]) => <section key={label} aria-label={`${label} requests`}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>
              {items.length === 0 ? <p className="text-sm text-muted">No {label.toLowerCase()} requests.</p> : items.map((request) => <div key={request._id} className="mb-3 space-y-2 rounded-xl border border-border p-3">
                <p className="truncate text-base font-semibold">{request.user.name}</p><div className="flex flex-wrap gap-2">
                  {label === "Incoming" ? <><button disabled={busy} onClick={() => onFriendAction("accept", request._id)} className={actionClass}>Accept</button><button disabled={busy} onClick={() => onFriendAction("decline", request._id)} className={actionClass}>Decline</button></> : <button disabled={busy} onClick={() => onFriendAction("cancel", request._id)} className={actionClass}>Cancel</button>}
                </div>
              </div>)}
            </section>)}
          </div>
        ) : convsLoading ? <ListSkeleton rows={3} /> : convsError ? retryState(convsError, onRetryConversations, "Retry conversations") : entries.length === 0 ? <p className="px-4 py-3 text-sm text-muted">Your chats are loading. Search for a friend to get started.</p> : entries.map(({ user, conversation }) => {
          const last = conversation?.lastMessage;
          const count = conversation?.unreadCount || 0;
          return <button key={user._id} onClick={() => conversation ? onSelectConversation(conversation) : onSelectUser(user)} className={`mx-2 my-1 flex w-[calc(100%_-_1rem)] items-center gap-3 rounded-xl border-l-[3px] px-3 py-3 text-left transition-colors duration-150 hover:bg-surface-2 ${conversation && activeId === conversation._id ? "border-l-primary bg-active" : "border-l-transparent"}`}>
            <Avatar name={user.name} online={user.isBot || onlineIds.has(user._id)} />
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-base font-semibold">{user.name}</span>{user.isBot && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary-ink">Bot</span>}{last && <span className="shrink-0 text-xs text-muted">{formatListTime(last.createdAt)}</span>}</div>
              <div className="flex items-center justify-between gap-2"><span className={`truncate text-sm ${count ? "font-medium text-text " : "text-muted "}`}>{last ? `${last.sender === me._id ? "You: " : ""}${last.type === "image" ? `Photo${last.caption ? `: ${last.caption}` : ""}` : last.content}` : "No messages yet"}</span>{count > 0 && <span aria-label={`${count} unread messages`} className="flex h-5 min-w-5 shrink-0 items-center justify-center brand-gradient rounded-full px-1.5 text-xs font-semibold text-on-primary">{count}</span>}</div>
            </div>
          </button>;
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-border p-3">
        <Avatar name={me.name} /><div className="min-w-0 flex-1"><p className="truncate text-base font-semibold">{me.name}</p><p className="truncate text-xs text-muted">{me.email}</p></div>
        <ThemeToggle />
        <button onClick={onLogout} aria-label="Log out" className="rounded-lg p-2 text-muted hover:bg-surface-2"><LogOut className="h-4 w-4" /></button>
      </div>
    </aside>
  );
}
