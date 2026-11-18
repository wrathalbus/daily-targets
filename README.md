# Daily Goals & Targets (React Native + Expo)

A clean day-wise daily goals and targets tracking app built with React Native and Expo with custom repeating schedules, detailed analytics & performance graphs, dual reminder notifications with sound, 1-minute time adjusters with continuous hold, daily deadline alerts, full persistent storage, target editing, and red dartboard branding.

## New Features Added

### 1. Custom Repeating Schedule Options
When setting a target as **Repeating (`🔁`)**, you can now choose between three flexible schedule modes:
- **Every Day**: Repeats every single day (standard daily habit).
- **Weekly Days (e.g. Every Monday, Wednesday & Friday)**:
  - Interactive circular day toggles (`M`, `T`, `W`, `T`, `F`, `S`, `S`).
  - Target automatically appears on the chosen weekdays every week.
- **Custom Dates (e.g. This week Monday, Next week Friday, Next week Tuesday & Wednesday)**:
  - Multi-select interactive calendar.
  - Pick specific planned dates across any month or year.
  - Selected dates are tagged and can be removed with a tap (`✕`).

### 2. Dedicated Target Performance & Graph Monitor (`📊`)
- **Direct Interaction**: Tapping any target card or its mini consistency bar graph opens the full **Target Performance** dashboard.
- **Metrics**:
  - **Consistency Rate (%)**: Percentage of scheduled active days completed.
  - **Completed Ratio**: e.g., `12 / 14 active days`.
- **Time Range Selector**: View metrics and bar graphs across **Last 7 Days**, **Last 14 Days**, or **Last 30 Days**.
- **Interactive Timeline**:
  - Horizontal scrollable daily bar chart with dates and weekday labels.
  - Tapping any bar in the graph toggles completion status for that specific date with immediate updates.
  - Color-coded legend: Completed (green), Missed (light gray), Not Scheduled (neutral).

---

## Complete Feature Summary
1. **Persistent Storage**: Uses `@react-native-async-storage/async-storage` with safety flags to prevent startup data loss.
2. **Target Editing (`✎`)**: Preloaded editor for modifying titles, categories, frequencies, reminders, and schedules.
3. **Dual Reminders with Sound**: Independent First and Second reminders with **🔊 Ring** and **🔕 Silent** toggles.
4. **1-Minute Steppers with Continuous Long-Press**: Rapid 70ms tick rate for hours and minutes.
5. **Daily Deadline Reminder**: Global evening alert (`🔔`) to complete pending goals.
6. **Non-Freezing Architecture**: Zero `<Modal>` elements to eliminate iOS touch deadlocks.
7. **App Icon Branding**: Red dartboard with dart bullseye design.

---

## How to Run with Expo

1. Start development server:
   ```bash
   cd /home/rahul/Apps/daily-goals
   npx expo start
   ```

2. Scan with **Expo Go** on Android or iOS.
