// Common Indian foods, approximate values per typical home serving.
// These are estimates — brands and home recipes vary. Users can add their own.
// [id, name, serving, kcal, protein, carbs, fat, tags]

type Row = [string, string, string, number, number, number, number, string[]];

const ROWS: Row[] = [
  // Breads & grains
  ["chapati", "Chapati / roti (no ghee)", "1 medium (~40 g)", 110, 3.3, 18, 3, ["roti", "chapati", "chapatti", "chapathi", "rotis", "chapatis"]],
  ["chapati_ghee", "Chapati with ghee", "1 medium", 150, 3.3, 18, 7, ["roti", "ghee"]],
  ["phulka", "Phulka (small, dry)", "1 small", 70, 2.5, 14, 0.5, ["phulka"]],
  ["paratha", "Plain paratha", "1", 220, 5, 30, 9, ["paratha"]],
  ["rice", "Rice, cooked", "1 cup (150 g)", 195, 4, 43, 0.4, ["rice", "chawal"]],
  ["brown_rice", "Brown rice, cooked", "1 cup (150 g)", 215, 5, 45, 1.8, ["brown rice"]],
  ["poha", "Poha", "1 plate", 250, 5, 45, 6, ["poha"]],
  ["upma", "Upma", "1 plate", 250, 6, 38, 8, ["upma"]],
  ["idli", "Idli", "1 piece", 58, 2, 12, 0.2, ["idli", "idlis"]],
  ["dosa", "Plain dosa", "1", 170, 4, 28, 5, ["dosa"]],
  ["masala_dosa", "Masala dosa", "1", 350, 7, 50, 13, ["masala dosa"]],
  ["khichdi", "Khichdi", "1 bowl", 230, 8, 38, 5, ["khichdi"]],
  ["oats", "Oats, dry", "40 g", 150, 5, 27, 2.7, ["oats"]],
  // Dals & legumes
  ["dal", "Dal (toor/arhar) with tadka", "1 katori (150 g)", 170, 9, 25, 4, ["dal", "daal"]],
  ["moong_dal", "Moong dal", "1 katori", 150, 10, 22, 3, ["moong"]],
  ["rajma", "Rajma curry", "1 katori", 210, 11, 30, 5, ["rajma"]],
  ["chole", "Chole / chana masala", "1 katori", 240, 11, 33, 8, ["chole", "chana masala"]],
  ["sambar", "Sambar", "1 katori", 130, 6, 18, 4, ["sambar"]],
  ["sprouts", "Sprouts salad", "1 katori", 110, 8, 18, 1, ["sprouts"]],
  ["roasted_chana", "Roasted chana", "30 g", 110, 6, 18, 1.8, ["roasted chana", "chana"]],
  ["besan_chilla", "Besan chilla", "1", 130, 6, 14, 5, ["chilla", "cheela"]],
  ["moong_chilla", "Moong dal chilla", "1", 120, 7, 15, 3, ["moong chilla"]],
  // Vegetables
  ["sabji", "Mixed veg sabji", "1 katori", 120, 3, 12, 7, ["sabji", "sabzi", "subji", "veg"]],
  ["aloo_sabji", "Aloo sabji", "1 katori", 170, 3, 22, 8, ["aloo", "potato"]],
  ["bhindi", "Bhindi sabji", "1 katori", 130, 3, 10, 9, ["bhindi", "okra"]],
  ["palak", "Palak (plain)", "1 katori", 90, 4, 8, 5, ["palak", "spinach"]],
  ["salad", "Cucumber-tomato salad", "1 bowl", 30, 1, 6, 0.2, ["salad", "cucumber"]],
  // Protein
  ["paneer_100", "Paneer", "100 g", 265, 18, 3.5, 20, ["paneer"]],
  ["lowfat_paneer_100", "Low-fat paneer", "100 g", 180, 20, 5, 9, ["low fat paneer"]],
  ["palak_paneer", "Palak paneer", "1 katori", 270, 12, 10, 20, ["palak paneer"]],
  ["paneer_bhurji", "Paneer bhurji (100 g paneer)", "1 katori", 320, 19, 8, 24, ["bhurji"]],
  ["tofu_100", "Tofu, firm", "100 g", 145, 15, 3, 8, ["tofu"]],
  ["soya_dry_50", "Soya chunks, dry", "50 g", 173, 26, 17, 0.3, ["soya", "soy chunks", "soya chunks"]],
  ["soya_curry", "Soya chunk curry (30 g dry)", "1 katori", 160, 16, 12, 5, ["soya curry"]],
  ["egg", "Egg, whole", "1 large", 72, 6.3, 0.4, 4.8, ["egg", "eggs", "boiled egg"]],
  ["egg_white", "Egg white", "1", 17, 3.6, 0.2, 0, ["egg white", "egg whites"]],
  ["omelette", "Omelette (2 eggs, 1 tsp oil)", "1", 190, 13, 2, 14, ["omelette", "omlette"]],
  ["chicken_breast_100", "Chicken breast, cooked", "100 g", 165, 31, 0, 3.6, ["chicken breast", "chicken"]],
  ["chicken_curry", "Chicken curry (~100 g chicken)", "1 katori", 250, 24, 6, 14, ["chicken curry"]],
  ["tandoori_chicken", "Tandoori chicken", "150 g", 260, 36, 4, 11, ["tandoori"]],
  ["fish_curry", "Fish curry", "1 katori", 220, 22, 5, 12, ["fish curry"]],
  ["fish_grilled_100", "Fish, grilled", "100 g", 130, 24, 0, 3, ["fish"]],
  ["chicken_biryani", "Chicken biryani", "1 plate", 500, 25, 60, 18, ["biryani"]],
  // Dairy & shakes
  ["whey", "Whey protein", "1 scoop (30 g)", 120, 24, 3, 1.5, ["whey", "protein powder", "protein shake", "shake", "scoop"]],
  ["curd", "Curd / dahi (toned)", "1 katori (150 g)", 90, 5, 7, 4, ["curd", "dahi", "yogurt"]],
  ["greek_yogurt", "Greek yogurt, plain", "150 g", 100, 15, 6, 2, ["greek yogurt", "hung curd"]],
  ["milk", "Milk, toned", "250 ml", 145, 8, 12, 7.5, ["milk"]],
  ["buttermilk", "Buttermilk / chaas", "250 ml", 40, 2.5, 5, 1, ["chaas", "buttermilk"]],
  ["tea", "Tea with milk & sugar", "1 cup", 70, 2, 10, 2, ["tea", "chai"]],
  ["coffee", "Coffee with milk & sugar", "1 cup", 70, 2, 10, 2, ["coffee"]],
  ["black_coffee", "Black coffee / tea, no sugar", "1 cup", 2, 0.2, 0, 0, ["black coffee", "green tea"]],
  // Fruit, nuts, extras
  ["banana", "Banana", "1 medium", 105, 1.3, 27, 0.4, ["banana"]],
  ["apple", "Apple", "1 medium", 95, 0.5, 25, 0.3, ["apple"]],
  ["peanut_butter", "Peanut butter", "1 tbsp (16 g)", 95, 4, 3, 8, ["peanut butter", "pb"]],
  ["almonds", "Almonds", "10 pieces", 70, 2.6, 2.5, 6, ["almonds", "badam"]],
  ["ghee", "Ghee", "1 tsp", 45, 0, 0, 5, ["ghee"]],
  ["oil", "Cooking oil", "1 tsp", 40, 0, 0, 4.5, ["oil"]],
  ["samosa", "Samosa", "1", 260, 4, 30, 14, ["samosa"]],
];

export interface FoodSeed {
  id: string;
  name: string;
  serving: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  tags: string[];
}

export const FOODS: FoodSeed[] = ROWS.map(([id, name, serving, kcal, protein, carbs, fat, tags]) => ({
  id,
  name,
  serving,
  kcal,
  protein,
  carbs,
  fat,
  tags,
}));

/** Suggested morning shake — the "quick add" on the food screen. */
export const MORNING_SHAKE = ["whey", "milk", "banana"];
