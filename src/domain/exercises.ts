import type { Exercise } from "../db/types";

export const EXERCISES: Record<string, Exercise> = Object.fromEntries(
  (
    [
      // Lower body / glutes
      ["bw_squat", "Bodyweight squat", "strength", "reps", "Sit back and down, knees track over toes, chest proud."],
      ["squat", "Squat", "strength", "reps", "Hold a backpack or dumbbell at the chest. Full foot pressure, controlled descent.", true],
      ["glute_bridge", "Glute bridge", "strength", "reps", "Ribs down, drive through heels, squeeze glutes 1–2 s at the top.", true],
      ["hip_thrust", "Hip thrust", "strength", "reps", "Upper back on a sofa/bench, chin tucked, full hip lock-out, pause at top.", true],
      ["reverse_lunge", "Reverse lunge", "strength", "reps", "Step back, slight forward torso lean for more glute. Each side.", true, true],
      ["bss", "Bulgarian split squat", "strength", "reps", "Rear foot on a chair; lean slightly forward; control the lowering. Each side.", true, true],
      ["rdl", "Romanian deadlift", "strength", "reps", "Soft knees, push hips back, flat back, feel the hamstrings stretch.", true],
      ["backpack_rdl", "Backpack Romanian deadlift", "strength", "reps", "Hold a loaded backpack, hinge at the hips with a flat back.", true],
      ["step_up", "Step-up", "strength", "reps", "Whole foot on the step, drive through the heel, slow down. Each side.", true, true],
      ["hip_abduction", "Hip abduction", "strength", "reps", "Band above knees or side-lying; move from the hip, no rocking.", false, true],
      ["side_leg_raise", "Side-lying leg raise", "strength", "reps", "Toes slightly down, lift from the side of the hip. Each side.", false, true],
      ["calf_raise", "Calf raise", "strength", "reps", "Full range, pause at the top.", true],
      // Upper body
      ["incline_pushup", "Incline push-up", "strength", "reps", "Hands on a table/counter; body in one line. Lower the incline as it gets easy."],
      ["pushup", "Push-up", "strength", "reps", "Knees or toes. Elbows ~45°, body in one line."],
      ["row", "Backpack / band row", "strength", "reps", "Hinge forward, pull elbows to hips, squeeze shoulder blades.", true],
      ["shoulder_press", "Shoulder press", "strength", "reps", "Light load, ribs down, press overhead without arching.", true],
      // Core
      ["dead_bug", "Dead bug", "core", "reps", "Low back gently pressed down; slow opposite arm/leg reach. Each side.", false, true],
      ["bird_dog", "Bird dog", "core", "reps", "Hips level, reach long, pause 2 s. Each side.", false, true],
      ["side_plank", "Side plank", "core", "sec", "Knees or feet; straight line from head to knee/foot. Each side.", false, true],
      // Mobility
      ["hip_flexor_stretch", "Hip flexor stretch", "mobility", "sec", "Half-kneeling, tuck pelvis, gentle forward shift. Each side.", false, true],
      ["hamstring_stretch", "Hamstring stretch", "mobility", "sec", "Long spine, hinge until you feel a mild stretch. Each side.", false, true],
      ["adductor_stretch", "Adductor stretch", "mobility", "sec", "Wide stance or butterfly; breathe and relax into it."],
      ["figure4", "Figure-4 glute stretch", "mobility", "sec", "Ankle over opposite knee, gently draw in. Each side.", false, true],
      ["childs_pose", "Child's pose", "mobility", "sec", "Knees wide, breathe into the back."],
      ["deep_squat_hold", "Deep squat hold", "mobility", "sec", "Hold a support if needed, heels down if comfortable."],
      ["thoracic_rotation", "Thoracic rotation", "mobility", "reps", "Side-lying open book. Each side.", false, true],
      ["hip_9090", "90/90 hip mobility", "mobility", "reps", "Rotate knees side to side slowly, tall spine."],
      // Cardio
      ["walk", "Walking", "cardio", "min", "Easy-to-brisk pace; you should be able to talk."],
      // Pelvic floor — health-oriented, relaxation first
      ["diaphragm_breath", "Diaphragmatic breathing", "pelvic", "min", "Breathe low into the belly and sides; let the pelvic floor soften on the inhale."],
      ["pf_relax", "Pelvic-floor relaxation", "pelvic", "min", "Consciously let go; imagine the sit-bones widening as you inhale."],
      ["pf_contract", "Gentle pelvic-floor contraction", "pelvic", "reps", "Light lift (about 30–50% effort) for 3–5 s, then fully relax for twice as long."],
      ["pf_full_relax", "Full relaxation", "pelvic", "min", "Lie comfortably, release everything. Comfort, never pain."],
    ] as [string, string, Exercise["category"], Exercise["unit"], string, boolean?, boolean?][]
  ).map(([id, name, category, unit, cue, loadable, perSide]) => [
    id,
    { id, name, category, unit, cue, loadable: !!loadable, perSide: !!perSide },
  ]),
);

export const FLEX_ROUTINE = [
  "hip_flexor_stretch",
  "hamstring_stretch",
  "adductor_stretch",
  "figure4",
  "childs_pose",
  "deep_squat_hold",
  "thoracic_rotation",
  "hip_9090",
];

export const PELVIC_ROUTINE = ["diaphragm_breath", "pf_relax", "pf_contract", "pf_full_relax", "hip_9090", "adductor_stretch"];
