"use client";

import { useActionState } from "react";
import { createGoal, type GoalFormState } from "./actions";

const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const initialState: GoalFormState = {};

export default function NewGoalPage() {
  const [state, formAction, pending] = useActionState(
    createGoal,
    initialState,
  );

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold">Set your training goal</h1>
      <p className="mt-1 text-sm text-black/60">
        Tell the coach what you&apos;re training for.
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-6">
        <p className="text-sm text-black/60">
          Fill in a distance, a time, or both — e.g. 10 km in 45:00 (the
          coach works out the pace from the two).
        </p>

        <div>
          <label htmlFor="distanceKm" className="text-sm font-medium">
            Distance (km)
          </label>
          <input
            id="distanceKm"
            name="distanceKm"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 10"
            className="mt-2 w-full rounded-md border border-black/10 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="time" className="text-sm font-medium">
            Time (mm:ss or h:mm:ss)
          </label>
          <input
            id="time"
            name="time"
            placeholder="e.g. 45:00"
            className="mt-2 w-full rounded-md border border-black/10 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="targetDate" className="text-sm font-medium">
            Target date (optional)
          </label>
          <input
            id="targetDate"
            name="targetDate"
            type="date"
            className="mt-2 w-full rounded-md border border-black/10 px-3 py-2"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Training days</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => (
              <label
                key={day.value}
                className="flex items-center gap-2 text-sm"
              >
                <input type="checkbox" name="trainingDays" value={day.value} />
                {day.label}
              </label>
            ))}
          </div>
        </fieldset>

        {state.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save goal"}
        </button>
      </form>
    </div>
  );
}
