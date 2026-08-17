import React, { useState } from "react";
import ConversationPane from "./components/social/ConversationPane";

const mockUser = { id: "u1", name: "Test Debug" };
const mockMatch = { id: "u2", name: "222", avatar_url: null, is_online: true, email_verified: true, phone_verified: false };

export default function DebugMic() {
  const [draft, setDraft] = useState("");
  return (
    <div style={{ padding: 20, background: "#f5f5f7", minHeight: "100vh" }}>
      <div style={{ height: "85vh", maxWidth: 500, margin: "0 auto", background: "#fff", borderRadius: 28, overflow: "hidden", boxShadow: "0 16px 50px rgba(21,27,61,0.15)" }}>
        <ConversationPane
          activeMatch={mockMatch}
          currentUser={mockUser}
          otherTyping={false}
          messages={[]}
          hasMoreHistory={false}
          loadingOlder={false}
          onLoadOlder={() => {}}
          messageDraft={draft}
          setMessageDraft={setDraft}
          broadcastTyping={() => {}}
          sendMessage={() => {}}
          sendStickerMessage={() => {}}
          sendMediaMessage={(f, k) => console.log("sendMediaMessage", f, k)}
          retrySend={() => {}}
          onBack={() => {}}
          onOpenReport={() => {}}
          onOpenBlockConfirm={() => {}}
        />
      </div>
    </div>
  );
}
