/**
 * Compute a student's total exam duration from their base exam duration
 * and their accommodation codes.
 *
 * Extra-time codes:  "30MIN/HR"     → adds (baseMins / 60) × 30 extra minutes
 * STB codes:         "10MIN/HR STB" → adds (baseMins / 60) × 10 break minutes
 *
 * If a student somehow has multiple rates of the same type, the MAX is used.
 *
 * @param {number|null} baseMins  — exam_upload.exam_duration_mins
 * @param {string[]}    codes     — accommodation code strings, e.g. ['30MIN/HR', '10MIN/HR STB']
 * @returns {{ extraMins: number, stbMins: number, totalMins: number|null }}
 */
export function calcStudentDuration(baseMins, codes) {
  if (!baseMins || baseMins <= 0) {
    return { extraMins: 0, stbMins: 0, totalMins: null };
  }

  let maxExtraRate = 0;
  let maxStbRate = 0;

  for (const code of codes) {
    const extraMatch = code.match(/^(\d+)MIN\/HR$/);
    if (extraMatch) {
      maxExtraRate = Math.max(maxExtraRate, parseInt(extraMatch[1], 10));
      continue;
    }
    const stbMatch = code.match(/^(\d+)MIN\/HR STB$/);
    if (stbMatch) {
      maxStbRate = Math.max(maxStbRate, parseInt(stbMatch[1], 10));
    }
  }

  const extraMins = Math.round((baseMins / 60) * maxExtraRate);
  const stbMins = Math.round((baseMins / 60) * maxStbRate);

  return {
    extraMins,
    stbMins,
    totalMins: baseMins + extraMins + stbMins,
  };
}

/**
 * Given a time string "HH:MM" or "HH:MM:SS" and a duration in minutes,
 * return the end time as "HH:MM".
 */
export function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Returns true if two time windows [startA, startA+durA) and [startB, startB+durB) overlap.
 * Times are "HH:MM" strings, durations are in minutes.
 */
export function timesOverlap(startA, durA, startB, durB) {
  const toMins = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const aStart = toMins(startA);
  const aEnd = aStart + durA;
  const bStart = toMins(startB);
  const bEnd = bStart + durB;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Calculate hours until exam start.
 * Returns number of hours (can be negative if in the past).
 * If no time is provided, returns Infinity (no time restriction).
 *
 * @param {Date|string} examDate — exam date
 * @param {string|null} examTime — exam time "HH:MM" or null
 * @returns {number} hours until exam start
 */
export function hoursUntilExam(examDate, examTime) {
  if (!examTime) {
    return Infinity; // No time restriction if time is not set
  }

  const dateObj = typeof examDate === "string" ? new Date(examDate) : examDate;
  const [hours, minutes] = examTime.split(":").map(Number);

  const examDateTime = new Date(dateObj);
  examDateTime.setHours(hours, minutes, 0, 0);

  const now = new Date();
  const hoursUntil = (examDateTime - now) / (1000 * 60 * 60);

  return hoursUntil;
}
