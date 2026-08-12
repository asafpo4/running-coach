import { createGoal } from "./actions";

const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

export default function NewGoalPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold">Set your training goal</h1>
      <p className="mt-1 text-sm text-black/60">
        Tell the coach what you&apos;re training for.
      </p>

      <form action={createGoal} className="mt-8 flex flex-col gap-6">
        <fieldset>
          <legend className="text-sm font-medium">Goal type</legend>
          <div className="mt-2 flex gap-4">
            {[
              { value: "distance", label: "Distance" },
              { value: "pace", label: "Pace" },
              { value: "time", label: "Time" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="type"
                  value={opt.value}
                  defaultChecked={opt.value === "distance"}
                  required
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="targetValue" className="text-sm font-medium">
            Target
          </label>
          <input
            id="targetValue"
            name="targetValue"
            required
            placeholder="e.g. 10k, 5:00/km, 45:00"
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

        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 font-medium text-white"
        >
          Save goal
        </button>
      </form>
    </div>
  );
}
