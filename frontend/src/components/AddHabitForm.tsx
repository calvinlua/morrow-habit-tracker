import { useState, type FormEvent } from "react";
import type { NewHabit } from "../lib/types";

interface AddHabitFormProps {
  onCreate: (input: NewHabit) => Promise<void>;
}

export function AddHabitForm({ onCreate }: AddHabitFormProps) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("times");
  const [target, setTarget] = useState("1");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        unit: unit.trim() || "times",
        target: Number(target),
      });
      setName("");
      setTarget("1");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="add-habit" onSubmit={submit}>
      <label>
        <span>New habit</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Walk 10k steps"
          maxLength={120}
          required
        />
      </label>
      <label>
        <span>Target</span>
        <input
          type="number"
          min="0.5"
          step="0.5"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          required
        />
      </label>
      <label>
        <span>Unit</span>
        <input
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          maxLength={32}
        />
      </label>
      <button type="submit" disabled={saving || !name.trim()}>
        {saving ? "Adding…" : "Add habit"}
      </button>
    </form>
  );
}
