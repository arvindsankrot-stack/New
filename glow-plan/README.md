# Glow Plan

A phone-friendly daily tracker for a slim, feminine body plan: two meals a day (morning before office, night after 7 pm), a glute-focused workout split, habits, water, steps, weigh-ins and body measurements.

## Features
- **Today:** the day's morning and night meals (eggs every morning, non-veg on Tue/Fri), a **Swap** button to pick another meal, a workout checklist with how-to tips, a water counter, steps, six habits, a weigh-in and notes. The day score counts toward a streak at 70%+.
- **Progress:** stats (lost, to-go, kg per week, estimated goal date, BMI), a weight chart with a healthy-pace line and goal line, bust/waist/belly/hips/thigh history with changes and waist-to-hip ratio, and a 6-week consistency heatmap.
- **Plan:** the full weekly plan, daily targets, a protein cheat sheet and rules.
- **Me:** goals, theme, and backup/restore (JSON).

Data stays only in your browser (`localStorage`). Use **Download backup** to keep a copy or move to a new phone.

## Run it
- Locally: `cd glow-plan && python3 -m http.server 8000`, then open http://localhost:8000
- On your phone: host the repo with GitHub Pages (Settings → Pages → deploy from a branch), open `https://<user>.github.io/<repo>/glow-plan/`, then use **Add to Home Screen**. Works offline after the first load.
