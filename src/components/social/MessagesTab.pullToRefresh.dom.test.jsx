import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";

vi.mock("./ConversationPane", () => ({ default: () => <div>pane</div> }));

import MessagesTab from "./MessagesTab";

// Tirer pour rafraîchir la liste des conversations : appelle le rechargement
// existant de SocialShell (aperçus + non-lus + notifications) ; désactivé quand
// une conversation est ouverte (le geste appartient alors à la zone de messages).

function touch(type, y) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  ev.touches = type === "touchend" ? [] : [{ clientX: 100, clientY: y }];
  act(() => { document.body.dispatchEvent(ev); });
}
const pull = () => { touch("touchstart", 100); touch("touchmove", 200); touch("touchend"); };

const base = {
  matches: [{ id: "u2", name: "Alice" }],
  currentUser: { id: "u1" },
  goTab: vi.fn(),
  onSelectMatch: vi.fn(),
  messages: [],
};

afterEach(() => { document.documentElement.style.overscrollBehaviorY = ""; });

describe("MessagesTab — tirer pour rafraîchir", () => {
  it("rafraîchit la liste des conversations", async () => {
    const onRefreshConversations = vi.fn(async () => {});
    render(<MessagesTab {...base} activeMatch={null} onRefreshConversations={onRefreshConversations} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    pull();
    expect(onRefreshConversations).toHaveBeenCalledTimes(1);
    await act(async () => { await new Promise((r) => setTimeout(r, 650)); });
  });

  it("conversation ouverte : geste désactivé", () => {
    const onRefreshConversations = vi.fn();
    render(<MessagesTab {...base} activeMatch={base.matches[0]} onRefreshConversations={onRefreshConversations} />);
    pull();
    expect(onRefreshConversations).not.toHaveBeenCalled();
  });

  it("sans conversation ou sans callback : geste désactivé", () => {
    const onRefreshConversations = vi.fn();
    const { unmount } = render(<MessagesTab {...base} matches={[]} activeMatch={null} onRefreshConversations={onRefreshConversations} />);
    pull();
    unmount();
    render(<MessagesTab {...base} activeMatch={null} />);
    pull();
    expect(onRefreshConversations).not.toHaveBeenCalled();
  });
});
