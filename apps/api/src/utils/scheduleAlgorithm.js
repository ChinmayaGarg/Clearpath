/**
 * Exam scheduling algorithm.
 *
 * Assigns confirmed exam booking requests to physical rooms based on
 * accommodation requirements and grouping constraints.
 *
 * Priority order (1 = highest):
 *  1. Each student uses their approved exam time (fixed — non-negotiable)
 *  2. PREFER_SOLO (OWN ROOM) students: assign to smallest available room first
 *  3. STRICTLY_SOLO (RWG, DRAGON) students: must have a room to themselves
 *  4. Same course code students go in the same room
 *  5. Students grouped together must have start times within 10 minutes of each other
 *  6. Minimise end-time gap between students sharing a room
 *  7. Minimise total number of rooms used
 *
 * @param {Array} students  — each: { id, courseCode, startTimeMins, computedDurationMins,
 *                                    strictlySolo, prefersSolo }
 * @param {Array} rooms     — each: { id, capacity }, sorted by capacity ASC
 * @returns {Array}         — [{ roomId, studentIds: string[] }]
 */
export function assignStudentsToRooms(students, rooms) {
  // roomSlots: tracks how many students are in each room
  const roomSlots = rooms.map(r => ({
    id:       r.id,
    capacity: r.capacity,
    assigned: [],   // booking request ids
  }));

  const assigned = new Set();

  // ── Helper: average end time for students currently in a room ──────────────
  function avgEndTime(slot) {
    if (!slot.assigned.length) return null;
    const ends = slot.assigned.map(sid => {
      const s = students.find(x => x.id === sid);
      if (!s || s.startTimeMins == null || !s.computedDurationMins) return null;
      return s.startTimeMins + s.computedDurationMins;
    }).filter(v => v != null);
    if (!ends.length) return null;
    return ends.reduce((a, b) => a + b, 0) / ends.length;
  }

  // ── Helper: can student s be added to slot? (capacity + start time window) ─
  function canAdd(slot, s) {
    if (slot.assigned.length >= slot.capacity) return false;
    if (s.startTimeMins == null) return true; // no time set → no conflict
    for (const sid of slot.assigned) {
      const other = students.find(x => x.id === sid);
      if (!other || other.startTimeMins == null) continue;
      if (Math.abs(s.startTimeMins - other.startTimeMins) > 10) return false;
    }
    return true;
  }

  // ── Step 1: STRICTLY_SOLO students (RWG, DRAGON — triggers_rwg_flag) ───────
  // Each must be the ONLY student in their room. Assign to smallest empty room.
  const strictlySoloStudents = students.filter(s => s.strictlySolo);
  for (const s of strictlySoloStudents) {
    const room = roomSlots.find(r => r.assigned.length === 0 && r.capacity >= 1);
    if (room) {
      room.assigned.push(s.id);
      assigned.add(s.id);
    } else {
      // Graceful degradation: put in smallest available room (edge case)
      const fallback = roomSlots.find(r => r.assigned.length < r.capacity);
      if (fallback) {
        fallback.assigned.push(s.id);
        assigned.add(s.id);
      }
    }
  }

  // ── Step 2: PREFER_SOLO students (OWN ROOM — prefers_solo_room) ─────────────
  // Try the smallest room with any free space.
  const preferSoloStudents = students.filter(s => s.prefersSolo && !s.strictlySolo);
  for (const s of preferSoloStudents) {
    // Prefer smallest room so that larger rooms remain available for groups
    const sorted = [...roomSlots].sort((a, b) => a.capacity - b.capacity);
    const room = sorted.find(r => r.assigned.length < r.capacity);
    if (room) {
      room.assigned.push(s.id);
      assigned.add(s.id);
    }
  }

  // ── Step 3: SHARED students ──────────────────────────────────────────────────
  const sharedStudents = students.filter(s => !s.strictlySolo && !s.prefersSolo && !assigned.has(s.id));

  // 3a. Group by courseCode
  const byCourse = {};
  for (const s of sharedStudents) {
    const key = s.courseCode ?? '__unknown__';
    (byCourse[key] ??= []).push(s);
  }

  // 3b. Within each course group, sub-group by start time (sliding window ≤ 10 min)
  const subgroups = []; // [{ courseCode, students: [...] }]
  for (const [courseCode, courseStudents] of Object.entries(byCourse)) {
    // Sort by start time (null times go last)
    const sorted = [...courseStudents].sort((a, b) => {
      if (a.startTimeMins == null && b.startTimeMins == null) return 0;
      if (a.startTimeMins == null) return 1;
      if (b.startTimeMins == null) return -1;
      return a.startTimeMins - b.startTimeMins;
    });

    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i];
      const first = group[0];
      const bothHaveTime = s.startTimeMins != null && first.startTimeMins != null;
      const withinWindow = bothHaveTime && (s.startTimeMins - first.startTimeMins <= 10);
      if (withinWindow || !bothHaveTime) {
        group.push(s);
      } else {
        subgroups.push({ courseCode, students: group });
        group = [s];
      }
    }
    subgroups.push({ courseCode, students: group });
  }

  // 3c. Sort sub-groups by size DESC (largest groups get priority for bin-packing)
  subgroups.sort((a, b) => b.students.length - a.students.length);

  // 3d. Assign each sub-group to a room
  for (const group of subgroups) {
    // Try to find an existing room that:
    //   - already has students from the same course (rule 4)
    //   - all existing students have start times within 10 min of new students (rule 5)
    //   - has enough remaining capacity
    //   - minimises avg end-time gap (rule 6)

    let bestRoom = null;
    let bestScore = Infinity;

    for (const slot of roomSlots) {
      const remaining = slot.capacity - slot.assigned.length;
      if (remaining < group.students.length) continue;

      // Check start-time compatibility for all new students against all existing
      const compatible = group.students.every(s => canAdd({ ...slot, assigned: [...slot.assigned] }, s));
      if (!compatible) continue;

      // Score: prefer rooms with same course (lower = better), then minimise end-time gap
      const hasSameCourse = slot.assigned.some(sid => {
        const existing = students.find(x => x.id === sid);
        return existing?.courseCode === group.courseCode;
      });

      const sameCourseBonus = hasSameCourse ? -10000 : 0;
      const avgEnd = avgEndTime(slot);
      const groupAvgEnd = group.students
        .map(s => (s.startTimeMins != null && s.computedDurationMins) ? s.startTimeMins + s.computedDurationMins : null)
        .filter(v => v != null);
      const groupEndAvg = groupAvgEnd.length
        ? groupAvgEnd.reduce((a, b) => a + b, 0) / groupAvgEnd.length
        : null;

      const endGap = (avgEnd != null && groupEndAvg != null)
        ? Math.abs(avgEnd - groupEndAvg)
        : 0;

      // Rule 7: prefer rooms already in use (to minimise total rooms opened)
      const unusedPenalty = slot.assigned.length === 0 ? 5000 : 0;

      const score = sameCourseBonus + endGap + unusedPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestRoom  = slot;
      }
    }

    if (bestRoom) {
      for (const s of group.students) {
        bestRoom.assigned.push(s.id);
        assigned.add(s.id);
      }
    } else {
      // No compatible room found — assign individually to smallest available slots
      for (const s of group.students) {
        const fallback = roomSlots.find(r => r.assigned.length < r.capacity);
        if (fallback) {
          fallback.assigned.push(s.id);
          assigned.add(s.id);
        }
      }
    }
  }

  // Return only rooms that have at least one student
  return roomSlots
    .filter(r => r.assigned.length > 0)
    .map(r => ({ roomId: r.id, studentIds: r.assigned }));
}
