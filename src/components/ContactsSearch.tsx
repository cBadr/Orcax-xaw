"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ContactsSearch({ initialQ }: { initialQ: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q ? `/contacts?q=${encodeURIComponent(q)}` : "/contacts");
      }}
      className="flex gap-3"
    >
      <input
        className="input max-w-md"
        placeholder="Search by name, email, or company..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button type="submit" className="btn-secondary">Search</button>
    </form>
  );
}
