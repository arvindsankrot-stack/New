// Data model. Every record carries id, user_id, date, created_at, updated_at.
// `date` is a local calendar day (YYYY-MM-DD, in the user's timezone) — the
// unit most of the app reasons in. Timestamps are ISO strings.

export interface BaseRecord {
  id: string;
  user_id: string;
  date: string;
  created_at: string;
  updated_at: string;
}

export type Sex = "male" | "female" | "average";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";

export interface Range {
  min: number;
  max: number;
}

export interface Profile extends BaseRecord {
  name: string;
  birth_year: number;
  height_cm: number;
  timezone: string;
  /** Day 1 of the programme. */
  program_start: string;
  /** Which formula constant to use for BMR; HRT changes body composition, so this is user-chosen. */
  calc_basis: Sex;
  activity: ActivityLevel;
  /** User-adjustable. null = use calculated. */
  calorie_target_override: number | null;
  protein_target: Range;
  target_loss_kg_per_week: number;
  units: "in" | "cm";
  theme: "system" | "light" | "dark";
  auto_lock_minutes: number;
  /** Modules the user wants visible (private modules can be hidden entirely). */
  modules: { hypno: boolean; chastity: boolean; pelvic: boolean; feminization: boolean };
  hypno_daily_goal_min: number;
  cardio_weekly_goal_min: number;
}

export type MeasureKey =
  | "weight"
  | "bust"
  | "underbust"
  | "waist"
  | "belly"
  | "hips"
  | "shoulders"
  | "wrist"
  | "thigh"
  | "arm";

/** A body measurement snapshot. Fields left undefined were not measured that day.
 *  Lengths are stored in inches (the user's native unit); weight in kg. */
export interface BodyMeasurement extends BaseRecord {
  weight?: number;
  bust?: number;
  underbust?: number;
  waist?: number;
  belly?: number;
  hips?: number;
  shoulders?: number;
  wrist?: number;
  thigh?: number;
  arm?: number;
  is_baseline?: boolean;
  notes?: string;
}

/** Quick daily weigh-in. Kept separate from full measurements so weight can be logged daily. */
export interface WeightEntry extends BaseRecord {
  kg: number;
}

export interface Goal extends BaseRecord {
  key: MeasureKey;
  range: Range;
  /** Explicit wording: every target is aspirational, never guaranteed. */
  note?: string;
}

export interface FoodItem extends BaseRecord {
  name: string;
  serving: string;
  grams?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  tags?: string[];
  custom?: boolean;
}

export type Meal = "morning" | "midday" | "evening" | "snack";

export interface FoodEntry extends BaseRecord {
  food_id?: string;
  name: string;
  meal: Meal;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Where the numbers came from — "tracked" = user-entered/DB, "estimate" = parsed by coach. */
  source: "database" | "manual" | "coach_estimate";
}

export type ExerciseCategory = "strength" | "core" | "mobility" | "cardio" | "pelvic";

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** reps | seconds | minutes */
  unit: "reps" | "sec" | "min";
  cue: string;
  loadable?: boolean;
  perSide?: boolean;
}

export interface ExerciseSet {
  exercise_id: string;
  set_no: number;
  target: number;
  done: number;
  load_kg?: number;
  completed: boolean;
}

export interface WorkoutSession extends BaseRecord {
  template: string;
  title: string;
  started_at: string;
  finished_at?: string;
  sets: ExerciseSet[];
  /** 1 easy – 5 very hard */
  effort?: number;
  notes?: string;
  cardio_minutes?: number;
  cardio_type?: string;
}

export type MedCategory = "estradiol" | "antiandrogen" | "progesterone" | "other";

export interface Medication extends BaseRecord {
  name: string;
  category: MedCategory;
  dose: number;
  unit: string;
  route: string;
  times: string[];
  frequency: "daily" | "twice_daily" | "weekly" | "every_n_days" | "as_directed";
  every_n_days?: number;
  start_date: string;
  end_date?: string;
  clinician: string;
  notes?: string;
  active: boolean;
}

export interface MedicationLog extends BaseRecord {
  medication_id: string;
  /** The scheduled time slot this log satisfies (e.g. "08:00"). */
  slot: string;
  status: "taken" | "missed" | "skipped";
  taken_at?: string;
  note?: string;
}

export type LabKind =
  | "estradiol"
  | "testosterone"
  | "potassium"
  | "creatinine"
  | "egfr"
  | "prolactin"
  | "alt"
  | "lipids"
  | "glucose"
  | "hba1c"
  | "bp_systolic"
  | "bp_diastolic"
  | "other";

export interface LabResult extends BaseRecord {
  kind: LabKind;
  label: string;
  value: number;
  unit: string;
  ref_low?: number;
  ref_high?: number;
  notes?: string;
}

export interface LabSchedule extends BaseRecord {
  label: string;
  kinds: LabKind[];
  interval_days: number;
  last_done?: string;
  set_by: string;
}

export interface FeminizationEntry extends BaseRecord {
  bust?: number;
  underbust?: number;
  breast_tenderness?: number;
  breast_notes?: string;
  nipple_changes?: string;
  skin_oiliness?: number;
  skin_softness?: number;
  acne?: number;
  skin_dryness?: number;
  facial_hair?: number;
  body_hair?: number;
  shaves_per_week?: number;
  libido?: number;
  spontaneous_erections?: number;
  genital_changes?: string;
  other_changes?: string;
}

export type FlexArea = "hips" | "hamstrings" | "adductors" | "hip_flexors" | "deep_squat" | "overall";

export interface MobilitySession extends BaseRecord {
  minutes: number;
  kind: "mobility" | "pelvic";
  exercises: string[];
  /** Self-rated 1–10 per area; pain is never a metric. */
  scores: Partial<Record<FlexArea, number>>;
  relaxation?: number;
  comfort?: number;
  awareness?: number;
  notes?: string;
}

export interface HypnoSession extends BaseRecord {
  minutes: number;
  title: string;
  time_of_day: "morning" | "afternoon" | "evening" | "night";
  focus: string[];
  mood_before: number;
  mood_after: number;
  relaxation: number;
  notes?: string;
}

export interface ChastitySession extends BaseRecord {
  worn: boolean;
  start: string;
  end?: string;
  comfort?: number;
  skin_condition?: number;
  irritation: boolean;
  numbness: boolean;
  pain: boolean;
  swelling: boolean;
  discoloration: boolean;
  skin_injury: boolean;
  urination_difficulty: boolean;
  notes?: string;
}

export interface MonthlyCheckIn extends BaseRecord {
  month: number;
  measurement_id?: string;
  bp_systolic?: number;
  bp_diastolic?: number;
  reflections?: string;
  next_month_objectives: string[];
}

export interface ProgressPhoto extends BaseRecord {
  month: number;
  angle: "front" | "side" | "back";
  /** id in the separate encrypted blob store */
  blob_id: string;
  checklist: { lighting: boolean; distance: boolean; clothing: boolean; posture: boolean; camera_height: boolean };
}

export interface NotificationPref extends BaseRecord {
  kind: "morning" | "workout" | "evening" | "night" | "weekly" | "monthly" | "medication";
  enabled: boolean;
  time: string;
  message: string;
}

export interface CoachMessage extends BaseRecord {
  role: "user" | "coach";
  text: string;
}

export interface Tables {
  profile: Profile;
  measurements: BodyMeasurement;
  weights: WeightEntry;
  goals: Goal;
  foodItems: FoodItem;
  foodEntries: FoodEntry;
  workouts: WorkoutSession;
  medications: Medication;
  medLogs: MedicationLog;
  labs: LabResult;
  labSchedules: LabSchedule;
  feminization: FeminizationEntry;
  mobility: MobilitySession;
  hypno: HypnoSession;
  chastity: ChastitySession;
  checkins: MonthlyCheckIn;
  photos: ProgressPhoto;
  notifications: NotificationPref;
  coach: CoachMessage;
}

export type TableName = keyof Tables;

export const TABLES: TableName[] = [
  "profile",
  "measurements",
  "weights",
  "goals",
  "foodItems",
  "foodEntries",
  "workouts",
  "medications",
  "medLogs",
  "labs",
  "labSchedules",
  "feminization",
  "mobility",
  "hypno",
  "chastity",
  "checkins",
  "photos",
  "notifications",
  "coach",
];
