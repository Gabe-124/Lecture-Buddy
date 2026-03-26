import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Lecture Buddy",
  description: "Cloud-first classroom note-taking system scaffold",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">Cloud-first classroom notes</p>
              <h1>Lecture Buddy</h1>
              <p className="meta">
                Notes-first student view backed by Raspberry Pi capture, cloud processing, Convex,
                and UploadThing artifacts.
              </p>
            </div>
            <nav className="topbar__nav">
              <Link href="/">Sessions</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
