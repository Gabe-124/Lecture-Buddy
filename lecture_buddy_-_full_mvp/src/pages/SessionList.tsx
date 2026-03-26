import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  onSelectSession: (id: Id<"sessions">) => void;
}

export function SessionList({ onSelectSession }: Props) {
  const courses = useQuery(api.courses.listMine) ?? [];
  const seedDemo = useMutation(api.seed.seedDemo);
  const createCourse = useMutation(api.courses.create);
  const [seeding, setSeeding] = useState(false);
  const [showNewCourse, setShowNewCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemo();
      toast.success("Demo data loaded!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSeeding(false);
    }
  }

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    await createCourse({ name: newCourseName.trim(), code: newCourseCode.trim() || undefined });
    setNewCourseName("");
    setNewCourseCode("");
    setShowNewCourse(false);
    toast.success("Course created");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Courses</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewCourse(true)}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
          >
            + New Course
          </button>
        </div>
      </div>

      {showNewCourse && (
        <form onSubmit={handleCreateCourse} className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3">New Course</h3>
          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Course name (e.g. Intro to CS)"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              autoFocus
            />
            <input
              className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Code (CS101)"
              value={newCourseCode}
              onChange={(e) => setNewCourseCode(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Create</button>
            <button type="button" onClick={() => setShowNewCourse(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          </div>
        </form>
      )}

      {courses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-lg font-medium text-gray-600 mb-1">No courses yet</p>
          <p className="text-sm mb-6">Create a course or load demo data to get started.</p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {seeding ? "Loading…" : "Load Demo Data"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => (
            <CourseCard key={course._id} courseId={course._id} onSelectSession={onSelectSession} />
          ))}
          <div className="pt-4 border-t border-gray-100 text-center">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              {seeding ? "Loading…" : "↺ Reload demo data"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CourseCard({
  courseId,
  onSelectSession,
}: {
  courseId: Id<"courses">;
  onSelectSession: (id: Id<"sessions">) => void;
}) {
  const course = useQuery(api.courses.get, { courseId });
  const sessions = useQuery(api.sessions.listByCourse, { courseId }) ?? [];

  if (!course) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800">{course.name}</span>
        {course.code && (
          <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-mono">{course.code}</span>
        )}
        {course.instructorName && (
          <span className="text-xs text-gray-400 ml-auto">{course.instructorName}</span>
        )}
      </div>
      {sessions.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">No sessions yet</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sessions.map((session) => (
            <li key={session._id}>
              <button
                onClick={() => onSelectSession(session._id)}
                className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors flex items-center gap-3"
              >
                <StatusDot status={session.status} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">{session.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(session.startedAt).toLocaleDateString(undefined, {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                    {session.durationSeconds && (
                      <span className="ml-2">{Math.round(session.durationSeconds / 60)} min</span>
                    )}
                  </div>
                </div>
                <span className="text-gray-300 text-sm">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: "bg-green-400",
    processing: "bg-yellow-400 animate-pulse",
    recording: "bg-red-400 animate-pulse",
    error: "bg-red-600",
  };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? "bg-gray-300"}`} />;
}
