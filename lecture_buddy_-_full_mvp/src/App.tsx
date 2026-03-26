import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { useState } from "react";
import { SessionList } from "./pages/SessionList";
import { SessionDetail } from "./pages/SessionDetail";
import type { Id } from "../convex/_generated/dataModel";

export default function App() {
  const [selectedSessionId, setSelectedSessionId] = useState<Id<"sessions"> | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 shadow-sm">
        <button
          className="flex items-center gap-2 font-bold text-lg text-indigo-700 hover:text-indigo-900 transition-colors"
          onClick={() => setSelectedSessionId(null)}
        >
          <span className="text-xl">🎓</span> Lecture Buddy
        </button>
        <SignOutButton />
      </header>

      <main className="flex-1">
        <Unauthenticated>
          <div className="flex items-center justify-center min-h-[calc(100vh-56px)] p-8">
            <div className="w-full max-w-sm">
              <div className="text-center mb-8">
                <div className="text-5xl mb-3">🎓</div>
                <h1 className="text-2xl font-bold text-gray-900">Lecture Buddy</h1>
                <p className="text-gray-500 mt-1 text-sm">Your classroom notes, automatically.</p>
              </div>
              <SignInForm />
            </div>
          </div>
        </Unauthenticated>

        <Authenticated>
          {selectedSessionId ? (
            <SessionDetail
              sessionId={selectedSessionId}
              onBack={() => setSelectedSessionId(null)}
            />
          ) : (
            <SessionList onSelectSession={setSelectedSessionId} />
          )}
        </Authenticated>
      </main>
      <Toaster />
    </div>
  );
}
