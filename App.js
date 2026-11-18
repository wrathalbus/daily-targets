import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// Ensure foreground notifications always show alert, sound, and badge
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const STORAGE_KEY_GOALS = '@daily_goals_definitions_v12';
const STORAGE_KEY_HISTORY = '@daily_goals_history_v12';
const STORAGE_KEY_DEADLINE = '@daily_goals_deadline_settings_v12';

// Date utility functions
const formatDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTimeLabel = (hours, minutes) => {
  const h = hours % 12 || 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const m = String(minutes).padStart(2, '0');
  return `${h}:${m} ${ampm}`;
};

const getRelativeDate = (baseDate, offsetDays) => {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  return d;
};

// Generates the trailing N days ending at anchorDate
const getPastDays = (anchorDate, count = 7) => {
  const days = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = getRelativeDate(anchorDate, -i);
    days.push({
      dateKey: formatDateKey(d),
      dayLetter: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      dayShort: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      dateObj: d,
    });
  }
  return days;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_KEYS = [
  { id: 1, label: 'M', full: 'Mon' },
  { id: 2, label: 'T', full: 'Tue' },
  { id: 3, label: 'W', full: 'Wed' },
  { id: 4, label: 'T', full: 'Thu' },
  { id: 5, label: 'F', full: 'Fri' },
  { id: 6, label: 'S', full: 'Sat' },
  { id: 0, label: 'S', full: 'Sun' },
];

export default function App() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [goals, setGoals] = useState([]);
  const [history, setHistory] = useState({});
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // View Screens: 'list' | 'create' | 'edit' | 'deadline' | 'analytics' | 'calendar_schedule'
  const [currentScreen, setCurrentScreen] = useState('list');
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [analyticsGoal, setAnalyticsGoal] = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState(14); // 7, 14, or 30 days
  const [calendarScheduleDateKey, setCalendarScheduleDateKey] = useState(formatDateKey(new Date()));

  // Global Daily Deadline Reminder Settings
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlineHours, setDeadlineHours] = useState(21); // 9 PM
  const [deadlineMinutes, setDeadlineMinutes] = useState(0);
  const [deadlineSound, setDeadlineSound] = useState(true);
  const [deadlineNotificationId, setDeadlineNotificationId] = useState(null);

  // Form State for Adding / Editing Goal
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Personal');
  const [isRepeating, setIsRepeating] = useState(true);
  const [repeatMode, setRepeatMode] = useState('daily'); // 'daily' | 'weekdays' | 'specific_dates'
  const [selectedWeekdays, setSelectedWeekdays] = useState([1, 2, 3, 4, 5]); // Mon-Fri default for weekdays
  const [scheduledSpecificDates, setScheduledSpecificDates] = useState([]); // ['2026-11-23', '2026-11-27', ...]
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(getRelativeDate(new Date(), 7));

  // Dual Reminder Times & Ringing Options
  const [hasFirstReminder, setHasFirstReminder] = useState(false);
  const [firstReminderHours, setFirstReminderHours] = useState(9);
  const [firstReminderMinutes, setFirstReminderMinutes] = useState(0);
  const [firstReminderSound, setFirstReminderSound] = useState(true);

  const [hasSecondReminder, setHasSecondReminder] = useState(false);
  const [secondReminderHours, setSecondReminderHours] = useState(18);
  const [secondReminderMinutes, setSecondReminderMinutes] = useState(0);
  const [secondReminderSound, setSecondReminderSound] = useState(true);

  // In-line Expandable Panel Pickers: null | 'calendar-end' | 'calendar-schedule' | 'time-first' | 'time-second'
  const [activePickerPanel, setActivePickerPanel] = useState(null);

  // Calendar State
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Category filter
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('All');
  const categories = ['All', 'Personal', 'Health', 'Work', 'Habit', 'Learning'];

  // Reliable Ref tracking for long press
  const holdIntervalRef = useRef(null);
  const holdTimeoutRef = useRef(null);

  // Live state reference mirrors to prevent stale closure in hold intervals
  const firstReminderHoursRef = useRef(firstReminderHours);
  firstReminderHoursRef.current = firstReminderHours;
  const firstReminderMinutesRef = useRef(firstReminderMinutes);
  firstReminderMinutesRef.current = firstReminderMinutes;

  const secondReminderHoursRef = useRef(secondReminderHours);
  secondReminderHoursRef.current = secondReminderHours;
  const secondReminderMinutesRef = useRef(secondReminderMinutes);
  secondReminderMinutesRef.current = secondReminderMinutes;

  const deadlineHoursRef = useRef(deadlineHours);
  deadlineHoursRef.current = deadlineHours;
  const deadlineMinutesRef = useRef(deadlineMinutes);
  deadlineMinutesRef.current = deadlineMinutes;

  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate]);
  const last7Days = useMemo(() => getPastDays(selectedDate, 7), [selectedDate]);

  useEffect(() => {
    setupNotificationChannels();
    requestNotificationPermissions();
    loadData();
    return () => clearHoldTimers();
  }, []);

  // Save to persistent storage automatically only after initial load completes
  useEffect(() => {
    if (isDataLoaded) {
      saveData();
    }
  }, [goals, history, isDataLoaded]);

  // Setup Android notification channels
  const setupNotificationChannels = async () => {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default-sound', {
          name: 'Daily Goals Alerts (Sound)',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4f46e5',
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('default-silent', {
          name: 'Daily Goals Alerts (Silent)',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: null,
          enableVibrate: false,
        });
      } catch (e) {
        console.warn('Channel setup warning:', e);
      }
    }
  };

  const requestNotificationPermissions = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Notification permission not granted.');
      }
    } catch (e) {
      console.warn('Error requesting notification permissions:', e);
    }
  };

  const loadData = async () => {
    try {
      const storedGoals = await AsyncStorage.getItem(STORAGE_KEY_GOALS);
      const storedHistory = await AsyncStorage.getItem(STORAGE_KEY_HISTORY);
      const storedDeadline = await AsyncStorage.getItem(STORAGE_KEY_DEADLINE);

      if (storedGoals) {
        setGoals(JSON.parse(storedGoals));
      } else {
        const todayStr = formatDateKey(new Date());
        const dMinus1 = formatDateKey(getRelativeDate(new Date(), -1));
        const dMinus2 = formatDateKey(getRelativeDate(new Date(), -2));

        const initialGoals = [
          {
            id: '1',
            title: 'Morning 20m Walk',
            category: 'Health',
            isRepeating: true,
            repeatMode: 'daily',
            startDate: dMinus2,
            endDate: null,
            firstReminder: '08:00 AM',
            firstReminderHours: 8,
            firstReminderMinutes: 0,
            firstSound: true,
            secondReminder: '06:00 PM',
            secondReminderHours: 18,
            secondReminderMinutes: 0,
            secondSound: true,
            firstNotificationId: null,
            secondNotificationId: null,
          },
          {
            id: '2',
            title: 'Weekly Team Sync Prep',
            category: 'Work',
            isRepeating: true,
            repeatMode: 'weekdays',
            selectedWeekdays: [1, 3, 5], // Mon, Wed, Fri
            startDate: dMinus2,
            endDate: null,
            firstReminder: null,
            firstReminderHours: null,
            firstReminderMinutes: null,
            firstSound: true,
            secondReminder: null,
            secondReminderHours: null,
            secondReminderMinutes: null,
            secondSound: true,
            firstNotificationId: null,
            secondNotificationId: null,
          },
        ];

        const initialHistory = {
          [dMinus2]: { '1': true, '2': true },
          [dMinus1]: { '1': true },
          [todayStr]: { '1': true },
        };

        setGoals(initialGoals);
        setHistory(initialHistory);
      }

      if (storedHistory && storedGoals) {
        setHistory(JSON.parse(storedHistory));
      }

      if (storedDeadline) {
        const parsed = JSON.parse(storedDeadline);
        setDeadlineEnabled(parsed.enabled);
        if (parsed.hours !== undefined) setDeadlineHours(parsed.hours);
        if (parsed.minutes !== undefined) setDeadlineMinutes(parsed.minutes);
        if (parsed.sound !== undefined) setDeadlineSound(parsed.sound);
        if (parsed.notificationId) setDeadlineNotificationId(parsed.notificationId);
      }
    } catch (e) {
      console.error('Error loading data', e);
    } finally {
      setIsDataLoaded(true);
    }
  };

  const saveData = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
      await AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    } catch (e) {
      console.error('Error saving data', e);
    }
  };

  // Schedule notification using exact future timestamp calculations
  const scheduleGoalNotification = async (goalTitle, dateKey, repeating, hours, minutes, ringSound, isFollowUp = false) => {
    try {
      const now = new Date();
      let targetDate;

      if (repeating) {
        targetDate = new Date();
        targetDate.setHours(hours, minutes, 0, 0);

        if (targetDate.getTime() <= now.getTime()) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
      } else {
        const [year, month, day] = dateKey.split('-').map(Number);
        targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

        if (targetDate.getTime() <= now.getTime()) {
          console.log(`[Notification] Time ${hours}:${minutes} already passed for one-time target`);
          return null;
        }
      }

      const channelId = Platform.OS === 'android' ? (ringSound ? 'default-sound' : 'default-silent') : undefined;

      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: isFollowUp ? `⚠️ Second Reminder: ${goalTitle}` : `🎯 First Reminder: ${goalTitle}`,
          body: isFollowUp
            ? `Still incomplete? Make sure to finish "${goalTitle}" today!`
            : `Time for your daily target: "${goalTitle}". Let's get it done!`,
          sound: ringSound ? 'default' : null,
          channelId,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: targetDate,
        },
      });

      console.log(`[Notification Scheduled] (${isFollowUp ? '2nd' : '1st'}) ID: ${notifId} target: ${targetDate.toLocaleString()}`);
      return notifId;
    } catch (err) {
      console.warn('[Notification Error]', err);
      return null;
    }
  };

  const saveDailyDeadlineSettings = async (enabled, hours, minutes, ringSound) => {
    try {
      if (deadlineNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(deadlineNotificationId);
      }

      let newNotifId = null;
      if (enabled) {
        const now = new Date();
        const targetDate = new Date();
        targetDate.setHours(hours, minutes, 0, 0);
        if (targetDate.getTime() <= now.getTime()) {
          targetDate.setDate(targetDate.getDate() + 1);
        }

        newNotifId = await Notifications.scheduleNotificationAsync({
          content: {
            title: '⏳ Daily Deadline Reminder',
            body: `Don't forget to review and complete your daily goals before the day ends!`,
            sound: ringSound ? 'default' : null,
            channelId: Platform.OS === 'android' ? (ringSound ? 'default-sound' : 'default-silent') : undefined,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: targetDate,
          },
        });
      }

      const settings = {
        enabled,
        hours,
        minutes,
        sound: ringSound,
        notificationId: newNotifId,
      };

      setDeadlineEnabled(enabled);
      setDeadlineHours(hours);
      setDeadlineMinutes(minutes);
      setDeadlineSound(ringSound);
      setDeadlineNotificationId(newNotifId);
      await AsyncStorage.setItem(STORAGE_KEY_DEADLINE, JSON.stringify(settings));
      setCurrentScreen('list');
      Alert.alert(
        'Deadline Reminder Saved',
        enabled
          ? `Daily reminder scheduled at ${formatTimeLabel(hours, minutes)} (${ringSound ? 'Ringing' : 'Silent'}).`
          : 'Daily reminder disabled.'
      );
    } catch (e) {
      console.error('Failed to set deadline reminder', e);
    }
  };

  // Determine if a goal is active on a given dateKey
  const isGoalActiveOnDate = (goal, dateKey) => {
    // Cannot appear before its start date
    if (goal.startDate && dateKey < goal.startDate) return false;
    // Cannot appear after its end date
    if (goal.endDate && dateKey > goal.endDate) return false;

    // One-time target: active only on start date
    if (!goal.isRepeating) {
      return dateKey === goal.startDate;
    }

    // Repeating: Check custom repeating schedule mode
    const mode = goal.repeatMode || 'daily';
    if (mode === 'daily') {
      return true;
    }

    if (mode === 'weekdays') {
      // Check day of week (0: Sun, 1: Mon, ..., 6: Sat)
      const [y, m, d] = dateKey.split('-').map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      const allowedDays = goal.selectedWeekdays || [];
      return allowedDays.includes(dayOfWeek);
    }

    if (mode === 'specific_dates') {
      // Only active on explicitly scheduled custom dates
      const dates = goal.scheduledSpecificDates || [];
      return dates.includes(dateKey);
    }

    return true;
  };

  const dayGoals = useMemo(() => {
    return goals.filter((g) => {
      const active = isGoalActiveOnDate(g, selectedDateKey);
      if (!active) return false;
      if (activeCategoryFilter !== 'All' && g.category !== activeCategoryFilter) return false;
      return true;
    });
  }, [goals, selectedDateKey, activeCategoryFilter]);

  const toggleGoalForDate = (goalId, targetDateKey) => {
    setHistory((prev) => {
      const dayMap = prev[targetDateKey] ? { ...prev[targetDateKey] } : {};
      if (dayMap[goalId]) {
        delete dayMap[goalId];
      } else {
        dayMap[goalId] = true;
      }
      return {
        ...prev,
        [targetDateKey]: dayMap,
      };
    });
  };

  const deleteGoal = async (goalId) => {
    const goalToDelete = goals.find((g) => g.id === goalId);
    Alert.alert('Delete Target', 'Do you want to permanently delete this target and reminders?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (goalToDelete) {
            try {
              if (goalToDelete.firstNotificationId) {
                await Notifications.cancelScheduledNotificationAsync(goalToDelete.firstNotificationId);
              }
              if (goalToDelete.secondNotificationId) {
                await Notifications.cancelScheduledNotificationAsync(goalToDelete.secondNotificationId);
              }
            } catch (e) {}
          }

          setGoals((prev) => prev.filter((g) => g.id !== goalId));
          setHistory((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((d) => {
              if (next[d] && next[d][goalId]) {
                const sub = { ...next[d] };
                delete sub[goalId];
                next[d] = sub;
              }
            });
            return next;
          });

          if (currentScreen === 'analytics' && analyticsGoal?.id === goalId) {
            setCurrentScreen('list');
          }
        },
      },
    ]);
  };

  // Open Create Form
  const openCreateScreen = () => {
    setTitle('');
    setCategory('Personal');
    setIsRepeating(true);
    setRepeatMode('daily');
    setSelectedWeekdays([1, 2, 3, 4, 5]);
    setScheduledSpecificDates([]);
    setHasEndDate(false);
    setEndDate(getRelativeDate(selectedDate, 7));
    setHasFirstReminder(false);
    setFirstReminderHours(9);
    setFirstReminderMinutes(0);
    setFirstReminderSound(true);
    setHasSecondReminder(false);
    setSecondReminderHours(18);
    setSecondReminderMinutes(0);
    setSecondReminderSound(true);
    setActivePickerPanel(null);
    clearHoldTimers();
    setEditingGoalId(null);
    setCurrentScreen('create');
  };

  // Open Edit Form preloaded with the target's existing values
  const openEditScreen = (goal) => {
    setTitle(goal.title || '');
    setCategory(goal.category || 'Personal');
    setIsRepeating(!!goal.isRepeating);
    setRepeatMode(goal.repeatMode || 'daily');
    setSelectedWeekdays(goal.selectedWeekdays || [1, 2, 3, 4, 5]);
    setScheduledSpecificDates(goal.scheduledSpecificDates || []);
    setHasEndDate(!!goal.endDate);
    if (goal.endDate) {
      const [y, m, d] = goal.endDate.split('-').map(Number);
      setEndDate(new Date(y, m - 1, d));
    } else {
      setEndDate(getRelativeDate(selectedDate, 7));
    }

    if (goal.firstReminderHours !== null && goal.firstReminderHours !== undefined) {
      setHasFirstReminder(true);
      setFirstReminderHours(goal.firstReminderHours);
      setFirstReminderMinutes(goal.firstReminderMinutes || 0);
    } else {
      setHasFirstReminder(false);
      setFirstReminderHours(9);
      setFirstReminderMinutes(0);
    }
    setFirstReminderSound(goal.firstSound !== false);

    if (goal.secondReminderHours !== null && goal.secondReminderHours !== undefined) {
      setHasSecondReminder(true);
      setSecondReminderHours(goal.secondReminderHours);
      setSecondReminderMinutes(goal.secondReminderMinutes || 0);
    } else {
      setHasSecondReminder(false);
      setSecondReminderHours(18);
      setSecondReminderMinutes(0);
    }
    setSecondReminderSound(goal.secondSound !== false);

    setActivePickerPanel(null);
    clearHoldTimers();
    setEditingGoalId(goal.id);
    setCurrentScreen('edit');
  };

  // Open Analytics Screen for a specific goal
  const openAnalyticsScreen = (goal) => {
    setAnalyticsGoal(goal);
    setAnalyticsRange(14);
    setCurrentScreen('analytics');
  };

  // Toggle weekday selection for weekdays repeat mode
  const toggleWeekday = (dayId) => {
    setSelectedWeekdays((prev) => {
      if (prev.includes(dayId)) {
        if (prev.length <= 1) {
          Alert.alert('Notice', 'Please select at least one day.');
          return prev;
        }
        return prev.filter((d) => d !== dayId);
      } else {
        return [...prev, dayId].sort();
      }
    });
  };

  // Toggle specific custom calendar date for specific_dates repeat mode
  const toggleSpecificDate = (dateKey) => {
    setScheduledSpecificDates((prev) => {
      if (prev.includes(dateKey)) {
        return prev.filter((k) => k !== dateKey);
      } else {
        return [...prev, dateKey].sort();
      }
    });
  };

  // Save New or Updated Goal
  const saveGoal = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Validation Error', 'Please enter a goal title.');
      return;
    }

    if (isRepeating && repeatMode === 'specific_dates' && scheduledSpecificDates.length === 0) {
      Alert.alert('Validation Error', 'Please select at least one specific date on the calendar.');
      return;
    }

    if (isRepeating && repeatMode === 'weekdays' && selectedWeekdays.length === 0) {
      Alert.alert('Validation Error', 'Please select at least one day of the week.');
      return;
    }

    let finalEndDate = null;
    if (hasEndDate) {
      const endFormatted = formatDateKey(endDate);
      if (endFormatted < selectedDateKey) {
        Alert.alert('Invalid Date', 'End date cannot be earlier than start date.');
        return;
      }
      finalEndDate = endFormatted;
    }

    if (editingGoalId) {
      const existing = goals.find((g) => g.id === editingGoalId);
      if (existing) {
        if (existing.firstNotificationId) {
          await Notifications.cancelScheduledNotificationAsync(existing.firstNotificationId).catch(() => {});
        }
        if (existing.secondNotificationId) {
          await Notifications.cancelScheduledNotificationAsync(existing.secondNotificationId).catch(() => {});
        }
      }
    }

    let firstNotifId = null;
    let firstReminderString = null;
    if (hasFirstReminder) {
      firstNotifId = await scheduleGoalNotification(
        trimmed,
        selectedDateKey,
        isRepeating,
        firstReminderHours,
        firstReminderMinutes,
        firstReminderSound,
        false
      );
      firstReminderString = formatTimeLabel(firstReminderHours, firstReminderMinutes);
    }

    let secondNotifId = null;
    let secondReminderString = null;
    if (hasSecondReminder) {
      secondNotifId = await scheduleGoalNotification(
        trimmed,
        selectedDateKey,
        isRepeating,
        secondReminderHours,
        secondReminderMinutes,
        secondReminderSound,
        true
      );
      secondReminderString = formatTimeLabel(secondReminderHours, secondReminderMinutes);
    }

    if (editingGoalId) {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === editingGoalId
            ? {
                ...g,
                title: trimmed,
                category,
                isRepeating,
                repeatMode: isRepeating ? repeatMode : 'daily',
                selectedWeekdays: isRepeating && repeatMode === 'weekdays' ? selectedWeekdays : [],
                scheduledSpecificDates: isRepeating && repeatMode === 'specific_dates' ? scheduledSpecificDates : [],
                endDate: finalEndDate,
                firstReminder: firstReminderString,
                firstReminderHours: hasFirstReminder ? firstReminderHours : null,
                firstReminderMinutes: hasFirstReminder ? firstReminderMinutes : null,
                firstSound: firstReminderSound,
                secondReminder: secondReminderString,
                secondReminderHours: hasSecondReminder ? secondReminderHours : null,
                secondReminderMinutes: hasSecondReminder ? secondReminderMinutes : null,
                secondSound: secondReminderSound,
                firstNotificationId: firstNotifId,
                secondNotificationId: secondNotifId,
              }
            : g
        )
      );
    } else {
      const newGoal = {
        id: Date.now().toString(),
        title: trimmed,
        category,
        isRepeating,
        repeatMode: isRepeating ? repeatMode : 'daily',
        selectedWeekdays: isRepeating && repeatMode === 'weekdays' ? selectedWeekdays : [],
        scheduledSpecificDates: isRepeating && repeatMode === 'specific_dates' ? scheduledSpecificDates : [],
        startDate: selectedDateKey,
        endDate: finalEndDate,
        firstReminder: firstReminderString,
        firstReminderHours: hasFirstReminder ? firstReminderHours : null,
        firstReminderMinutes: hasFirstReminder ? firstReminderMinutes : null,
        firstSound: firstReminderSound,
        secondReminder: secondReminderString,
        secondReminderHours: hasSecondReminder ? secondReminderHours : null,
        secondReminderMinutes: hasSecondReminder ? secondReminderMinutes : null,
        secondSound: secondReminderSound,
        firstNotificationId: firstNotifId,
        secondNotificationId: secondNotifId,
      };
      setGoals((prev) => [newGoal, ...prev]);
    }

    setCurrentScreen('list');
    setEditingGoalId(null);

    // Show save confirmation so user knows target is saved even if not visible today
    if (!editingGoalId && isRepeating && repeatMode !== 'daily') {
      let scheduleDesc = '';
      if (repeatMode === 'weekdays') {
        const dayNames = selectedWeekdays
          .map((id) => WEEKDAY_KEYS.find((w) => w.id === id)?.full)
          .filter(Boolean)
          .join(', ');
        scheduleDesc = `It will appear on: ${dayNames} each week.`;
      } else if (repeatMode === 'specific_dates') {
        scheduleDesc = `It will appear on your ${scheduledSpecificDates.length} selected date(s).`;
      }
      if (scheduleDesc) {
        Alert.alert('Target Saved! 🎯', `"${trimmed}" has been created.\n\n${scheduleDesc}\n\nNavigate to those days to see it.`);
      }
    }
  };

  const changeDate = (days) => setSelectedDate((prev) => getRelativeDate(prev, days));
  const setDateToToday = () => setSelectedDate(new Date());

  const completedCount = useMemo(() => {
    const dayMap = history[selectedDateKey] || {};
    return dayGoals.filter((g) => !!dayMap[g.id]).length;
  }, [dayGoals, history, selectedDateKey]);

  const totalCount = dayGoals.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isToday = selectedDateKey === formatDateKey(new Date());

  // Consistency metrics helper
  const getGoalConsistencyStats = (goal, dayList) => {
    if (!goal) return { dataPoints: [], completedInWindow: 0, applicableDaysInWindow: 0, rate: 0 };
    let completedInWindow = 0;
    let applicableDaysInWindow = 0;

    const dataPoints = dayList.map((day) => {
      const active = isGoalActiveOnDate(goal, day.dateKey);
      const isDone = !!(history[day.dateKey] && history[day.dateKey][goal.id]);

      if (active) applicableDaysInWindow++;
      if (isDone) completedInWindow++;

      return {
        ...day,
        active,
        isDone,
      };
    });

    const rate =
      applicableDaysInWindow > 0
        ? Math.round((completedInWindow / applicableDaysInWindow) * 100)
        : 0;

    return { dataPoints, completedInWindow, applicableDaysInWindow, rate };
  };

  // Calendar calculations
  const changeCalendarMonth = (offset) => {
    let nextMonth = calendarMonth + offset;
    let nextYear = calendarYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setCalendarMonth(nextMonth);
    setCalendarYear(nextYear);
  };

  const calendarGrid = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push({ empty: true, key: `empty-${i}` });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dObj = new Date(calendarYear, calendarMonth, day);
      const isPast = formatDateKey(dObj) < formatDateKey(new Date());
      cells.push({
        empty: false,
        day,
        dateObj: dObj,
        dateKey: formatDateKey(dObj),
        isPast,
        key: `day-${day}`,
      });
    }
    return cells;
  }, [calendarYear, calendarMonth]);

  // Clean timer utility
  const clearHoldTimers = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  // Robust hold-to-change implementation using live refs
  const handleHoldPress = (stepAction) => {
    clearHoldTimers();
    stepAction();
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        stepAction();
      }, 70);
    }, 250);
  };

  // Time Picker Component
  const renderTimeAdjuster = (type, currentHours, currentMinutes, currentSound, onToggleSound) => {
    const h12 = currentHours % 12 || 12;
    const ampm = currentHours >= 12 ? 'PM' : 'AM';

    const getRefVals = () => {
      if (type === 'first') return { h: firstReminderHoursRef.current, m: firstReminderMinutesRef.current };
      if (type === 'second') return { h: secondReminderHoursRef.current, m: secondReminderMinutesRef.current };
      return { h: deadlineHoursRef.current, m: deadlineMinutesRef.current };
    };

    const updateVals = (newH, newM) => {
      if (type === 'first') {
        firstReminderHoursRef.current = newH;
        firstReminderMinutesRef.current = newM;
        setFirstReminderHours(newH);
        setFirstReminderMinutes(newM);
      } else if (type === 'second') {
        secondReminderHoursRef.current = newH;
        secondReminderMinutesRef.current = newM;
        setSecondReminderHours(newH);
        setSecondReminderMinutes(newM);
      } else {
        deadlineHoursRef.current = newH;
        deadlineMinutesRef.current = newM;
        setDeadlineHours(newH);
        setDeadlineMinutes(newM);
      }
    };

    const stepHour = (delta) => {
      const { h, m } = getRefVals();
      const currentH12 = h % 12 || 12;
      const isPM = h >= 12;
      let nextH12 = currentH12 + delta;
      if (nextH12 < 1) nextH12 = 12;
      if (nextH12 > 12) nextH12 = 1;
      const final24 = (nextH12 % 12) + (isPM ? 12 : 0);
      updateVals(final24, m);
    };

    const stepMin = (delta) => {
      const { h, m } = getRefVals();
      let nextMin = m + delta;
      if (nextMin < 0) nextMin = 59;
      if (nextMin > 59) nextMin = 0;
      updateVals(h, nextMin);
    };

    const toggleAmpm = (newAmpm) => {
      const { h, m } = getRefVals();
      const base12 = h % 12;
      const final24 = base12 + (newAmpm === 'PM' ? 12 : 0);
      updateVals(final24, m);
    };

    return (
      <View style={styles.timePickerContainer}>
        <View style={styles.inlineTimeAdjuster}>
          <View style={styles.timeUnitCol}>
            <Text style={styles.timeUnitLabel}>HOUR</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPressIn={() => handleHoldPress(() => stepHour(-1))}
                onPressOut={clearHoldTimers}
                activeOpacity={0.6}
              >
                <Text style={styles.counterBtnText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.counterValueText}>{h12}</Text>
              <TouchableOpacity
                style={styles.counterBtn}
                onPressIn={() => handleHoldPress(() => stepHour(1))}
                onPressOut={clearHoldTimers}
                activeOpacity={0.6}
              >
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.timeColon}>:</Text>

          <View style={styles.timeUnitCol}>
            <Text style={styles.timeUnitLabel}>MINUTE (HOLD +/-)</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPressIn={() => handleHoldPress(() => stepMin(-1))}
                onPressOut={clearHoldTimers}
                activeOpacity={0.6}
              >
                <Text style={styles.counterBtnText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.counterValueText}>{String(currentMinutes).padStart(2, '0')}</Text>
              <TouchableOpacity
                style={styles.counterBtn}
                onPressIn={() => handleHoldPress(() => stepMin(1))}
                onPressOut={clearHoldTimers}
                activeOpacity={0.6}
              >
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.timeUnitCol}>
            <Text style={styles.timeUnitLabel}>PERIOD</Text>
            <View style={styles.ampmToggleRow}>
              <TouchableOpacity
                style={[styles.ampmBtn, ampm === 'AM' && styles.ampmBtnActive]}
                onPress={() => toggleAmpm('AM')}
              >
                <Text style={[styles.ampmBtnText, ampm === 'AM' && styles.ampmBtnTextActive]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ampmBtn, ampm === 'PM' && styles.ampmBtnActive]}
                onPress={() => toggleAmpm('PM')}
              >
                <Text style={[styles.ampmBtnText, ampm === 'PM' && styles.ampmBtnTextActive]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.soundOptionRow}>
          <Text style={styles.soundOptionLabel}>Ring Alert Sound</Text>
          <TouchableOpacity
            style={[styles.soundToggleBtn, currentSound ? styles.soundToggleActive : styles.soundToggleSilent]}
            onPress={() => onToggleSound(!currentSound)}
          >
            <Text style={styles.soundToggleText}>{currentSound ? '🔊 Ring' : '🔕 Silent'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const getRepeatDescription = (goal) => {
    if (!goal.isRepeating) return '⚡ One-Time';
    const mode = goal.repeatMode || 'daily';
    if (mode === 'daily') return '🔁 Daily';
    if (mode === 'weekdays') {
      const names = (goal.selectedWeekdays || []).map((d) => {
        const match = WEEKDAY_KEYS.find((w) => w.id === d);
        return match ? match.full : '';
      });
      return `🔁 ${names.join(', ')}`;
    }
    if (mode === 'specific_dates') {
      const count = (goal.scheduledSpecificDates || []).length;
      return `🔁 Custom (${count} days)`;
    }
    return '🔁 Repeating';
  };

  const renderGoalItem = ({ item }) => {
    const isCompleted = !!(history[selectedDateKey] && history[selectedDateKey][item.id]);
    const { dataPoints, completedInWindow, rate } = getGoalConsistencyStats(item, last7Days);

    return (
      <View style={styles.goalCard}>
        <View style={styles.cardHeaderRow}>
          <TouchableOpacity
            style={[styles.checkbox, isCompleted && styles.checkboxCompleted]}
            onPress={() => toggleGoalForDate(item.id, selectedDateKey)}
            activeOpacity={0.7}
          >
            {isCompleted && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.goalTitleContainer}
            onPress={() => openAnalyticsScreen(item)}
            activeOpacity={0.7}
          >
            <View style={styles.titleRowWithAnalytics}>
              <Text style={[styles.goalTitle, isCompleted && styles.goalTitleCompleted]}>
                {item.title}
              </Text>
              <Text style={styles.analyticsHintIcon}>📊</Text>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{item.category}</Text>
              </View>

              <View
                style={[
                  styles.typeBadge,
                  item.isRepeating ? styles.repeatingBadge : styles.oneTimeBadge,
                ]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    item.isRepeating ? styles.repeatingText : styles.oneTimeText,
                  ]}
                >
                  {getRepeatDescription(item)}
                </Text>
              </View>

              {item.firstReminder && (
                <View style={styles.reminderBadge}>
                  <Text style={styles.reminderBadgeText}>
                    ⏰ 1st: {item.firstReminder} {item.firstSound ? '🔊' : '🔕'}
                  </Text>
                </View>
              )}

              {item.secondReminder && (
                <View style={styles.reminderBadgeSecond}>
                  <Text style={styles.reminderBadgeSecondText}>
                    ⚠️ 2nd: {item.secondReminder} {item.secondSound ? '🔊' : '🔕'}
                  </Text>
                </View>
              )}

              {item.endDate && (
                <View style={styles.endDateBadge}>
                  <Text style={styles.endDateBadgeText}>Until {item.endDate}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Action Buttons: Edit ✎ and Delete ✕ */}
          <View style={styles.cardActionGroup}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => openEditScreen(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.editBtnText}>✎</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => deleteGoal(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Consistency Mini Bar Graph */}
        <TouchableOpacity
          style={styles.graphContainer}
          onPress={() => openAnalyticsScreen(item)}
          activeOpacity={0.8}
        >
          <View style={styles.graphHeader}>
            <Text style={styles.graphTitle}>Consistency (Last 7 Days) • Tap for detailed graph</Text>
            <Text style={styles.graphScore}>
              {completedInWindow}/7 • <Text style={styles.graphScoreHighlight}>{rate}%</Text>
            </Text>
          </View>

          <View style={styles.barsRow}>
            {dataPoints.map((point) => {
              const isCurrentDay = point.dateKey === selectedDateKey;

              return (
                <TouchableOpacity
                  key={point.dateKey}
                  style={styles.barColumn}
                  onPress={() => toggleGoalForDate(item.id, point.dateKey)}
                  activeOpacity={0.7}
                >
                  <View style={styles.barSlot}>
                    <View
                      style={[
                        styles.barFill,
                        point.isDone
                          ? styles.barFillDone
                          : point.active
                          ? styles.barFillMissed
                          : styles.barFillInactive,
                        isCurrentDay && styles.barHighlightBorder,
                      ]}
                    />
                  </View>

                  <Text
                    style={[
                      styles.barDayLabel,
                      isCurrentDay && styles.barDayLabelActive,
                    ]}
                  >
                    {point.dayLetter}
                  </Text>
                  <Text
                    style={[
                      styles.barDateNum,
                      isCurrentDay && styles.barDateNumActive,
                    ]}
                  >
                    {point.dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Analytics helper calculations
  const analyticsDays = useMemo(() => {
    return getPastDays(selectedDate, analyticsRange);
  }, [selectedDate, analyticsRange]);

  const analyticsStats = useMemo(() => {
    if (!analyticsGoal) return null;
    return getGoalConsistencyStats(analyticsGoal, analyticsDays);
  }, [analyticsGoal, analyticsDays, history]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* ======================================================== */}
      {/* 1. MAIN LIST VIEW */}
      {/* ======================================================== */}
      {currentScreen === 'list' && (
        <View style={styles.flex1}>
          {/* Top Bar */}
          <View style={styles.topAppBar}>
            <Text style={styles.appBrandTitle}>DAILY GOALS</Text>
            <View style={styles.topAppBarActions}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => {
                  setCalendarMonth(selectedDate.getMonth());
                  setCalendarYear(selectedDate.getFullYear());
                  setCalendarScheduleDateKey(formatDateKey(selectedDate));
                  setCurrentScreen('calendar_schedule');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.calendarNavBtnIcon}>📅</Text>
                <Text style={styles.calendarNavBtnText}>Month Schedule</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deadlineBellBtn, deadlineEnabled && styles.deadlineBellBtnActive]}
                onPress={() => setCurrentScreen('deadline')}
                activeOpacity={0.7}
              >
                <Text style={styles.deadlineBellIcon}>{deadlineEnabled ? '🔔' : '🔕'}</Text>
                <Text style={[styles.deadlineBellText, deadlineEnabled && styles.deadlineBellTextActive]}>
                  {deadlineEnabled
                    ? formatTimeLabel(deadlineHours, deadlineMinutes)
                    : 'Deadline'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Date Header & Switcher */}
          <View style={styles.header}>
            <View style={styles.dateBar}>
              <TouchableOpacity style={styles.navArrow} onPress={() => changeDate(-1)}>
                <Text style={styles.navArrowText}>‹</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={setDateToToday} style={styles.dateCenter}>
                <Text style={styles.dayText}>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                </Text>
                <Text style={styles.dateText}>
                  {selectedDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                {isToday ? (
                  <View style={styles.todayPill}>
                    <Text style={styles.todayPillText}>TODAY</Text>
                  </View>
                ) : (
                  <Text style={styles.tapToTodayText}>Tap to go to today</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.navArrow} onPress={() => changeDate(1)}>
                <Text style={styles.navArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Overall Day Progress */}
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Daily Targets Completed</Text>
                <Text style={styles.progressCount}>
                  {completedCount} / {totalCount} ({progressPercent}%)
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
              </View>
            </View>
          </View>

          {/* Categories Scroller */}
          <View style={styles.categoriesSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    activeCategoryFilter === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setActiveCategoryFilter(cat)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      activeCategoryFilter === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Goals List */}
          <FlatList
            data={dayGoals}
            keyExtractor={(item) => item.id}
            renderItem={renderGoalItem}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🎯</Text>
                <Text style={styles.emptyTitle}>No targets for this day</Text>
                <Text style={styles.emptySub}>
                  {isToday
                    ? 'Create a daily repeating, custom scheduled, or one-time target to start your day!'
                    : 'No scheduled targets found active on this date.'}
                </Text>
              </View>
            }
          />

          {/* Floating Add Target Button */}
          <TouchableOpacity style={styles.fab} onPress={openCreateScreen} activeOpacity={0.85}>
            <Text style={styles.fabIcon}>+</Text>
            <Text style={styles.fabText}>New Target</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ======================================================== */}
      {/* 2. CREATE / EDIT TARGET FULL-PAGE VIEW */}
      {/* ======================================================== */}
      {(currentScreen === 'create' || currentScreen === 'edit') && (
        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.pageHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen('list')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>✕ Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pageTitle}>{currentScreen === 'edit' ? 'Edit Target' : 'Create Target'}</Text>
            <TouchableOpacity onPress={saveGoal} style={styles.saveHeaderBtn}>
              <Text style={styles.saveHeaderBtnText}>{currentScreen === 'edit' ? 'Update' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.pageScroll}
            contentContainerStyle={styles.pageScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title Input */}
            <Text style={styles.fieldLabel}>TARGET TITLE</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Read 20 mins, Workout, Ship project..."
              placeholderTextColor="#94a3b8"
              value={title}
              onChangeText={setTitle}
            />

            {/* Category */}
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <View style={styles.modalCatRow}>
              {['Personal', 'Health', 'Work', 'Habit', 'Learning'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.modalCatChip, category === c && styles.modalCatChipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text
                    style={[
                      styles.modalCatChipText,
                      category === c && styles.modalCatChipTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Target Frequency */}
            <Text style={styles.fieldLabel}>FREQUENCY</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, isRepeating && styles.toggleBtnActive]}
                onPress={() => setIsRepeating(true)}
              >
                <Text style={[styles.toggleBtnText, isRepeating && styles.toggleBtnTextActive]}>
                  🔁 Repeating
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, !isRepeating && styles.toggleBtnActive]}
                onPress={() => setIsRepeating(false)}
              >
                <Text style={[styles.toggleBtnText, !isRepeating && styles.toggleBtnTextActive]}>
                  ⚡ One-Time
                </Text>
              </TouchableOpacity>
            </View>

            {/* CUSTOM REPEAT SCHEDULE CONTROLS */}
            {isRepeating && (
              <View style={styles.formSectionBox}>
                <Text style={styles.fieldLabelBold}>REPEAT SCHEDULE</Text>

                <View style={styles.repeatModeRow}>
                  <TouchableOpacity
                    style={[styles.repeatModeBtn, repeatMode === 'daily' && styles.repeatModeBtnActive]}
                    onPress={() => setRepeatMode('daily')}
                  >
                    <Text style={[styles.repeatModeBtnText, repeatMode === 'daily' && styles.repeatModeBtnTextActive]}>
                      Every Day
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.repeatModeBtn, repeatMode === 'weekdays' && styles.repeatModeBtnActive]}
                    onPress={() => setRepeatMode('weekdays')}
                  >
                    <Text style={[styles.repeatModeBtnText, repeatMode === 'weekdays' && styles.repeatModeBtnTextActive]}>
                      Weekly Days
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.repeatModeBtn, repeatMode === 'specific_dates' && styles.repeatModeBtnActive]}
                    onPress={() => setRepeatMode('specific_dates')}
                  >
                    <Text style={[styles.repeatModeBtnText, repeatMode === 'specific_dates' && styles.repeatModeBtnTextActive]}>
                      Custom Dates
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Option A: Weekly Day Picker (e.g. Every Monday, Wednesday) */}
                {repeatMode === 'weekdays' && (
                  <View style={styles.subScheduleBox}>
                    <Text style={styles.subScheduleDesc}>Repeats on selected days each week:</Text>
                    <View style={styles.weekdayPillRow}>
                      {WEEKDAY_KEYS.map((w) => {
                        const isSelected = selectedWeekdays.includes(w.id);
                        return (
                          <TouchableOpacity
                            key={w.id}
                            style={[styles.weekdayCircle, isSelected && styles.weekdayCircleActive]}
                            onPress={() => toggleWeekday(w.id)}
                          >
                            <Text style={[styles.weekdayCircleText, isSelected && styles.weekdayCircleTextActive]}>
                              {w.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Option B: Specific Custom Dates (This week Monday, Next week Friday, etc.) */}
                {repeatMode === 'specific_dates' && (
                  <View style={styles.subScheduleBox}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.subScheduleDesc}>
                        Selected Dates: <Text style={styles.highlightCount}>{scheduledSpecificDates.length} days</Text>
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setActivePickerPanel(
                            activePickerPanel === 'calendar-schedule' ? null : 'calendar-schedule'
                          )
                        }
                      >
                        <Text style={styles.linkActionText}>
                          {activePickerPanel === 'calendar-schedule' ? 'Hide Calendar' : '📅 Select Dates'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {scheduledSpecificDates.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedDatesScroll}>
                        {scheduledSpecificDates.map((dateStr) => (
                          <View key={dateStr} style={styles.dateTagPill}>
                            <Text style={styles.dateTagText}>{dateStr}</Text>
                            <TouchableOpacity onPress={() => toggleSpecificDate(dateStr)}>
                              <Text style={styles.dateTagRemove}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    )}

                    {/* Inline Multi-Date Calendar Selector */}
                    {activePickerPanel === 'calendar-schedule' && (
                      <View style={styles.inlineCalendarHolder}>
                        <View style={styles.customCalHeader}>
                          <TouchableOpacity onPress={() => changeCalendarMonth(-1)} style={styles.calNavBtn}>
                            <Text style={styles.calNavText}>‹</Text>
                          </TouchableOpacity>
                          <Text style={styles.calTitleText}>
                            {MONTH_NAMES[calendarMonth]} {calendarYear}
                          </Text>
                          <TouchableOpacity onPress={() => changeCalendarMonth(1)} style={styles.calNavBtn}>
                            <Text style={styles.calNavText}>›</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.calWeekRow}>
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, idx) => (
                            <Text key={idx} style={styles.calWeekDayLabel}>{w}</Text>
                          ))}
                        </View>

                        <View style={styles.calDaysGrid}>
                          {calendarGrid.map((item) => {
                            if (item.empty) {
                              return <View key={item.key} style={styles.calDayCell} />;
                            }
                            const isScheduled = scheduledSpecificDates.includes(item.dateKey);
                            return (
                              <TouchableOpacity
                                key={item.key}
                                style={[styles.calDayCell, isScheduled && styles.calDayCellSelected]}
                                onPress={() => toggleSpecificDate(item.dateKey)}
                              >
                                <Text
                                  style={[
                                    styles.calDayNum,
                                    item.isPast && styles.calDayNumPast,
                                    isScheduled && styles.calDayNumSelected,
                                  ]}
                                >
                                  {item.day}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* FIRST REMINDER */}
            <View style={styles.formSectionBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.fieldLabelBold}>⏰ FIRST REMINDER</Text>
                <TouchableOpacity onPress={() => setHasFirstReminder(!hasFirstReminder)}>
                  <Text style={styles.linkActionText}>
                    {hasFirstReminder ? 'Disable' : '+ Set Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              {hasFirstReminder && (
                <View>
                  <TouchableOpacity
                    style={styles.pickerSelectorBtn}
                    onPress={() =>
                      setActivePickerPanel(activePickerPanel === 'time-first' ? null : 'time-first')
                    }
                  >
                    <Text style={styles.pickerSelectorLabel}>First Reminder Time:</Text>
                    <Text style={styles.pickerSelectorValue}>
                      {formatTimeLabel(firstReminderHours, firstReminderMinutes)} {firstReminderSound ? '🔊' : '🔕'}{' '}
                      {activePickerPanel === 'time-first' ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>

                  {activePickerPanel === 'time-first' && (
                    <View style={styles.expandablePanel}>
                      {renderTimeAdjuster(
                        'first',
                        firstReminderHours,
                        firstReminderMinutes,
                        firstReminderSound,
                        (sound) => setFirstReminderSound(sound)
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* SECOND REMINDER */}
            <View style={styles.formSectionBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.fieldLabelBold}>⚠️ SECOND REMINDER (FOLLOW-UP)</Text>
                <TouchableOpacity onPress={() => setHasSecondReminder(!hasSecondReminder)}>
                  <Text style={styles.linkActionText}>
                    {hasSecondReminder ? 'Disable' : '+ Set Time'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldSubHelper}>
                Alerts you later in the day if the target is still not completed.
              </Text>

              {hasSecondReminder && (
                <View>
                  <TouchableOpacity
                    style={styles.pickerSelectorBtn}
                    onPress={() =>
                      setActivePickerPanel(activePickerPanel === 'time-second' ? null : 'time-second')
                    }
                  >
                    <Text style={styles.pickerSelectorLabel}>Second Reminder Time:</Text>
                    <Text style={styles.pickerSelectorValueSecond}>
                      {formatTimeLabel(secondReminderHours, secondReminderMinutes)} {secondReminderSound ? '🔊' : '🔕'}{' '}
                      {activePickerPanel === 'time-second' ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>

                  {activePickerPanel === 'time-second' && (
                    <View style={styles.expandablePanel}>
                      {renderTimeAdjuster(
                        'second',
                        secondReminderHours,
                        secondReminderMinutes,
                        secondReminderSound,
                        (sound) => setSecondReminderSound(sound)
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* CALENDAR END DATE */}
            {isRepeating && (
              <View style={styles.formSectionBox}>
                <View style={styles.rowBetween}>
                  <Text style={styles.fieldLabelBold}>📅 CALENDAR END DATE</Text>
                  <TouchableOpacity onPress={() => setHasEndDate(!hasEndDate)}>
                    <Text style={styles.linkActionText}>
                      {hasEndDate ? 'Remove End Date' : '+ Pick Date'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {hasEndDate && (
                  <View>
                    <TouchableOpacity
                      style={styles.pickerSelectorBtn}
                      onPress={() =>
                        setActivePickerPanel(activePickerPanel === 'calendar-end' ? null : 'calendar-end')
                      }
                    >
                      <Text style={styles.pickerSelectorLabel}>Repeats Until:</Text>
                      <Text style={styles.pickerSelectorValue}>
                        {endDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}{' '}
                        {activePickerPanel === 'calendar-end' ? '▲' : '📅'}
                      </Text>
                    </TouchableOpacity>

                    {activePickerPanel === 'calendar-end' && (
                      <View style={styles.expandablePanel}>
                        <View style={styles.customCalHeader}>
                          <TouchableOpacity onPress={() => changeCalendarMonth(-1)} style={styles.calNavBtn}>
                            <Text style={styles.calNavText}>‹</Text>
                          </TouchableOpacity>
                          <Text style={styles.calTitleText}>
                            {MONTH_NAMES[calendarMonth]} {calendarYear}
                          </Text>
                          <TouchableOpacity onPress={() => changeCalendarMonth(1)} style={styles.calNavBtn}>
                            <Text style={styles.calNavText}>›</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.calWeekRow}>
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, idx) => (
                            <Text key={idx} style={styles.calWeekDayLabel}>{w}</Text>
                          ))}
                        </View>

                        <View style={styles.calDaysGrid}>
                          {calendarGrid.map((item) => {
                            if (item.empty) {
                              return <View key={item.key} style={styles.calDayCell} />;
                            }
                            const isSelected = formatDateKey(item.dateObj) === formatDateKey(endDate);
                            return (
                              <TouchableOpacity
                                key={item.key}
                                style={[styles.calDayCell, isSelected && styles.calDayCellSelected]}
                                onPress={() => setEndDate(item.dateObj)}
                              >
                                <Text
                                  style={[
                                    styles.calDayNum,
                                    item.isPast && styles.calDayNumPast,
                                    isSelected && styles.calDayNumSelected,
                                  ]}
                                >
                                  {item.day}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.bigSubmitBtn} onPress={saveGoal}>
              <Text style={styles.bigSubmitBtnText}>
                {currentScreen === 'edit' ? 'Update Target' : 'Create Target'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ======================================================== */}
      {/* 3. TARGET ANALYTICS & GRAPH MONITOR VIEW */}
      {/* ======================================================== */}
      {currentScreen === 'analytics' && analyticsGoal && analyticsStats && (
        <View style={styles.flex1}>
          <View style={styles.pageHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen('list')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.pageTitle}>Target Performance</Text>
            <TouchableOpacity onPress={() => openEditScreen(analyticsGoal)} style={styles.saveHeaderBtn}>
              <Text style={styles.saveHeaderBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageScrollContent}>
            {/* Target Header Card */}
            <View style={styles.analyticsHeaderCard}>
              <Text style={styles.analyticsTargetTitle}>{analyticsGoal.title}</Text>
              <View style={styles.metaRow}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{analyticsGoal.category}</Text>
                </View>
                <View style={[styles.typeBadge, analyticsGoal.isRepeating ? styles.repeatingBadge : styles.oneTimeBadge]}>
                  <Text style={[styles.typeBadgeText, analyticsGoal.isRepeating ? styles.repeatingText : styles.oneTimeText]}>
                    {getRepeatDescription(analyticsGoal)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Performance Metric Score Cards */}
            <View style={styles.analyticsMetricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>Consistency Rate</Text>
                <Text style={styles.metricCardValue}>{analyticsStats.rate}%</Text>
                <Text style={styles.metricCardSub}>in chosen window</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>Completed Days</Text>
                <Text style={styles.metricCardValueGreen}>
                  {analyticsStats.completedInWindow} / {analyticsStats.applicableDaysInWindow}
                </Text>
                <Text style={styles.metricCardSub}>scheduled active days</Text>
              </View>
            </View>

            {/* Range Toggle Buttons */}
            <View style={styles.analyticsRangeRow}>
              {[7, 14, 30].map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[styles.rangeBtn, analyticsRange === days && styles.rangeBtnActive]}
                  onPress={() => setAnalyticsRange(days)}
                >
                  <Text style={[styles.rangeBtnText, analyticsRange === days && styles.rangeBtnTextActive]}>
                    Last {days} Days
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Full Expanded Graph View */}
            <View style={styles.detailedGraphCard}>
              <Text style={styles.detailedGraphTitle}>Daily Completion Timeline</Text>
              <Text style={styles.detailedGraphSubtitle}>
                Tap any bar to toggle completion status for that specific date.
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailedGraphBars}>
                {analyticsStats.dataPoints.map((point) => {
                  const isCurrentDay = point.dateKey === selectedDateKey;

                  return (
                    <TouchableOpacity
                      key={point.dateKey}
                      style={styles.detailedBarCol}
                      onPress={() => toggleGoalForDate(analyticsGoal.id, point.dateKey)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.detailedBarSlot}>
                        <View
                          style={[
                            styles.detailedBarFill,
                            point.isDone
                              ? styles.barFillDone
                              : point.active
                              ? styles.barFillMissed
                              : styles.barFillInactive,
                            isCurrentDay && styles.barHighlightBorder,
                          ]}
                        />
                      </View>
                      <Text style={[styles.detailedDayText, isCurrentDay && styles.barDayLabelActive]}>
                        {point.dayShort}
                      </Text>
                      <Text style={[styles.detailedDateText, isCurrentDay && styles.barDateNumActive]}>
                        {point.dayNum}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Legend */}
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendBox, styles.barFillDone]} />
                  <Text style={styles.legendText}>Completed</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendBox, styles.barFillMissed]} />
                  <Text style={styles.legendText}>Missed</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendBox, styles.barFillInactive]} />
                  <Text style={styles.legendText}>Not Scheduled</Text>
                </View>
              </View>
            </View>

            {/* Danger Zone: Delete Goal */}
            <TouchableOpacity
              style={styles.dangerDeleteBtn}
              onPress={() => deleteGoal(analyticsGoal.id)}
            >
              <Text style={styles.dangerDeleteBtnText}>Delete This Target</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ======================================================== */}
      {/* 4. DAILY DEADLINE FULL-PAGE VIEW */}
      {/* ======================================================== */}
      {currentScreen === 'deadline' && (
        <View style={styles.flex1}>
          <View style={styles.pageHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen('list')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={styles.pageTitle}>Daily Deadline</Text>
            <TouchableOpacity
              onPress={() => saveDailyDeadlineSettings(deadlineEnabled, deadlineHours, deadlineMinutes, deadlineSound)}
              style={styles.saveHeaderBtn}
            >
              <Text style={styles.saveHeaderBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.deadlinePageBody}>
            <Text style={styles.deadlineModalSubtitle}>
              Receive an evening notification to remind you to review and complete any remaining daily goals.
            </Text>

            <View style={styles.rowBetweenMargin}>
              <Text style={styles.fieldLabelBold}>ENABLE DAILY REMINDER</Text>
              <TouchableOpacity
                style={[
                  styles.toggleSmallBtn,
                  deadlineEnabled ? styles.toggleSmallActive : styles.toggleSmallInactive,
                ]}
                onPress={() => setDeadlineEnabled(!deadlineEnabled)}
              >
                <Text
                  style={[
                    styles.toggleSmallText,
                    deadlineEnabled && styles.toggleSmallTextActive,
                  ]}
                >
                  {deadlineEnabled ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {deadlineEnabled && (
              <View style={styles.formSectionBox}>
                <Text style={styles.fieldLabelBold}>DEADLINE TIME & SOUND</Text>
                <View style={{ marginTop: 10 }}>
                  {renderTimeAdjuster(
                    'deadline',
                    deadlineHours,
                    deadlineMinutes,
                    deadlineSound,
                    (sound) => setDeadlineSound(sound)
                  )}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.bigSubmitBtn}
              onPress={() => saveDailyDeadlineSettings(deadlineEnabled, deadlineHours, deadlineMinutes, deadlineSound)}
            >
              <Text style={styles.bigSubmitBtnText}>Save Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ======================================================== */}
      {/* 5. FULL MONTH SCHEDULE CALENDAR VIEW */}
      {/* ======================================================== */}
      {currentScreen === 'calendar_schedule' && (
        <View style={styles.flex1}>
          <View style={styles.pageHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen('list')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.pageTitle}>Monthly Schedule</Text>
            <TouchableOpacity
              onPress={() => {
                const today = new Date();
                setCalendarMonth(today.getMonth());
                setCalendarYear(today.getFullYear());
                setCalendarScheduleDateKey(formatDateKey(today));
              }}
              style={styles.saveHeaderBtn}
            >
              <Text style={styles.saveHeaderBtnText}>Today</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageScrollContent}>
            {/* Calendar Card */}
            <View style={styles.monthScheduleCard}>
              <View style={styles.customCalHeader}>
                <TouchableOpacity onPress={() => changeCalendarMonth(-1)} style={styles.calNavBtn}>
                  <Text style={styles.calNavText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.monthScheduleHeaderTitle}>
                  {MONTH_NAMES[calendarMonth]} {calendarYear}
                </Text>
                <TouchableOpacity onPress={() => changeCalendarMonth(1)} style={styles.calNavBtn}>
                  <Text style={styles.calNavText}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calWeekRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w, idx) => (
                  <Text key={idx} style={styles.calWeekDayLabelLarge}>{w}</Text>
                ))}
              </View>

              <View style={styles.calDaysGrid}>
                {calendarGrid.map((item) => {
                  if (item.empty) {
                    return <View key={item.key} style={styles.calDayCellSchedule} />;
                  }

                  const dateKey = item.dateKey;
                  const activeGoals = goals.filter((g) => isGoalActiveOnDate(g, dateKey));
                  const totalActive = activeGoals.length;
                  const dayHistory = history[dateKey] || {};
                  const completedActive = activeGoals.filter((g) => !!dayHistory[g.id]).length;
                  const isSelectedDay = calendarScheduleDateKey === dateKey;
                  const isTodayCell = dateKey === formatDateKey(new Date());

                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.calDayCellSchedule,
                        isSelectedDay && styles.calDayCellScheduleSelected,
                        isTodayCell && styles.calDayCellToday,
                      ]}
                      onPress={() => setCalendarScheduleDateKey(dateKey)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.calDayNumSchedule,
                          item.isPast && styles.calDayNumPast,
                          isSelectedDay && styles.calDayNumScheduleSelected,
                          isTodayCell && styles.calDayNumToday,
                        ]}
                      >
                        {item.day}
                      </Text>
                      {totalActive > 0 ? (
                        <View style={styles.scheduleDayBadge}>
                          <Text
                            style={[
                              styles.scheduleDayBadgeText,
                              completedActive === totalActive && styles.scheduleDayBadgeComplete,
                            ]}
                          >
                            {completedActive}/{totalActive}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.scheduleDayEmptyDot}>-</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected Date Summary & Targets List */}
            {(() => {
              const [y, m, d] = calendarScheduleDateKey.split('-').map(Number);
              const previewDate = new Date(y, m - 1, d);
              const activeOnPreview = goals.filter((g) => isGoalActiveOnDate(g, calendarScheduleDateKey));
              const previewHistory = history[calendarScheduleDateKey] || {};

              return (
                <View style={styles.scheduleDetailsCard}>
                  <View style={styles.scheduleDetailsHeader}>
                    <View>
                      <Text style={styles.scheduleDetailsDateTitle}>
                        {previewDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      <Text style={styles.scheduleDetailsSubtitle}>
                        {activeOnPreview.length} target{activeOnPreview.length === 1 ? '' : 's'} scheduled
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.scheduleJumpBtn}
                      onPress={() => {
                        setSelectedDate(previewDate);
                        setCurrentScreen('list');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.scheduleJumpBtnText}>Go to Day ›</Text>
                    </TouchableOpacity>
                  </View>

                  {activeOnPreview.length === 0 ? (
                    <View style={styles.scheduleEmptyDay}>
                      <Text style={styles.scheduleEmptyDayText}>No targets scheduled for this date.</Text>
                    </View>
                  ) : (
                    <View style={styles.scheduleTargetList}>
                      {activeOnPreview.map((goal) => {
                        const isDone = !!previewHistory[goal.id];
                        return (
                          <View key={goal.id} style={styles.scheduleTargetItem}>
                            <TouchableOpacity
                              style={[styles.checkboxSmall, isDone && styles.checkboxCompleted]}
                              onPress={() => toggleGoalForDate(goal.id, calendarScheduleDateKey)}
                              activeOpacity={0.7}
                            >
                              {isDone && <Text style={styles.checkmarkSmall}>✓</Text>}
                            </TouchableOpacity>
                            <View style={styles.flex1}>
                              <Text
                                style={[
                                  styles.scheduleTargetTitle,
                                  isDone && styles.goalTitleCompleted,
                                ]}
                              >
                                {goal.title}
                              </Text>
                              <View style={styles.metaRow}>
                                <View style={styles.categoryBadge}>
                                  <Text style={styles.categoryBadgeText}>{goal.category}</Text>
                                </View>
                                <View
                                  style={[
                                    styles.typeBadge,
                                    goal.isRepeating ? styles.repeatingBadge : styles.oneTimeBadge,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.typeBadgeText,
                                      goal.isRepeating ? styles.repeatingText : styles.oneTimeText,
                                    ]}
                                  >
                                    {getRepeatDescription(goal)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  topAppBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  topAppBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  calendarNavBtnIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  calendarNavBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  appBrandTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4f46e5',
    letterSpacing: 1,
  },
  deadlineBellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  deadlineBellBtnActive: {
    backgroundColor: '#e0e7ff',
  },
  deadlineBellIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  deadlineBellText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  deadlineBellTextActive: {
    color: '#4338ca',
    fontWeight: '700',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  dateBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  navArrowText: {
    fontSize: 26,
    color: '#334155',
    fontWeight: '300',
    marginTop: -2,
  },
  dateCenter: {
    alignItems: 'center',
  },
  dayText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  dateText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  todayPill: {
    backgroundColor: '#e0e7ff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4f46e5',
  },
  tapToTodayText: {
    fontSize: 11,
    color: '#4f46e5',
    marginTop: 3,
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  progressCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4f46e5',
    flexShrink: 0,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4f46e5',
    borderRadius: 4,
  },
  categoriesSection: {
    paddingVertical: 4,
  },
  categoryScroll: {
    paddingHorizontal: 20,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#4f46e5',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryChipTextActive: {
    color: '#ffffff',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 90,
  },
  goalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxCompleted: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  checkmark: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  goalTitleContainer: {
    flex: 1,
  },
  titleRowWithAnalytics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  goalTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  analyticsHintIcon: {
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  repeatingBadge: {
    backgroundColor: '#eef2ff',
  },
  oneTimeBadge: {
    backgroundColor: '#fef3c7',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  repeatingText: {
    color: '#4338ca',
  },
  oneTimeText: {
    color: '#b45309',
  },
  reminderBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reminderBadgeText: {
    fontSize: 10,
    color: '#166534',
    fontWeight: '600',
  },
  reminderBadgeSecond: {
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reminderBadgeSecondText: {
    fontSize: 10,
    color: '#b45309',
    fontWeight: '600',
  },
  endDateBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  endDateBadgeText: {
    fontSize: 10,
    color: '#b91c1c',
    fontWeight: '600',
  },
  cardActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  editBtn: {
    padding: 8,
    borderRadius: 8,
  },
  editBtnText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 8,
  },
  deleteBtnText: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '700',
  },
  graphContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  graphTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
    flexShrink: 1,
    marginRight: 6,
  },
  graphScore: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    flexShrink: 0,
  },
  graphScoreHighlight: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barSlot: {
    height: 38,
    width: 22,
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  barFillDone: {
    backgroundColor: '#10b981',
  },
  barFillMissed: {
    backgroundColor: '#f1f5f9',
  },
  barFillInactive: {
    backgroundColor: '#e2e8f0',
  },
  barHighlightBorder: {
    borderWidth: 2,
    borderColor: '#4f46e5',
  },
  barDayLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
  },
  barDayLabelActive: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  barDateNum: {
    fontSize: 9,
    color: '#cbd5e1',
    marginTop: 1,
  },
  barDateNumActive: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  emptySub: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 30,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#4f46e5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabIcon: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginRight: 6,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },

  /* Full Page View */
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  backBtn: {
    padding: 6,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  pageTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  saveHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#4f46e5',
    borderRadius: 16,
  },
  saveHeaderBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldLabelBold: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  fieldSubHelper: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 16,
  },
  modalCatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  modalCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalCatChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  modalCatChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modalCatChipTextActive: {
    color: '#ffffff',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  toggleBtnActive: {
    backgroundColor: '#eef2ff',
    borderColor: '#6366f1',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  toggleBtnTextActive: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  formSectionBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  /* Custom Repeat Schedule Controls */
  repeatModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 10,
  },
  repeatModeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  repeatModeBtnActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#6366f1',
  },
  repeatModeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  repeatModeBtnTextActive: {
    color: '#4338ca',
    fontWeight: '700',
  },
  subScheduleBox: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  subScheduleDesc: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  highlightCount: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  weekdayPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  weekdayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  weekdayCircleActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  weekdayCircleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  weekdayCircleTextActive: {
    color: '#ffffff',
  },
  selectedDatesScroll: {
    flexDirection: 'row',
    marginVertical: 6,
  },
  dateTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  dateTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338ca',
    marginRight: 6,
  },
  dateTagRemove: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366f1',
  },
  inlineCalendarHolder: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },

  pickerSelectorBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pickerSelectorLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  pickerSelectorValue: {
    fontSize: 14,
    color: '#4f46e5',
    fontWeight: '700',
  },
  pickerSelectorValueSecond: {
    fontSize: 14,
    color: '#d97706',
    fontWeight: '700',
  },
  expandablePanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowBetweenMargin: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  linkActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4f46e5',
  },
  bigSubmitBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
    elevation: 2,
  },
  bigSubmitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Deadline View */
  deadlinePageBody: {
    padding: 20,
  },
  deadlineModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 18,
  },
  toggleSmallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  toggleSmallActive: {
    backgroundColor: '#10b981',
  },
  toggleSmallInactive: {
    backgroundColor: '#cbd5e1',
  },
  toggleSmallText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  toggleSmallTextActive: {
    color: '#ffffff',
  },

  /* Calendar Styles */
  customCalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  calNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calNavText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#334155',
    marginTop: -2,
  },
  calTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  calWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 4,
  },
  calWeekDayLabel: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  calDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  calDayCell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  calDayCellSelected: {
    backgroundColor: '#4f46e5',
  },
  calDayNum: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  calDayNumPast: {
    color: '#cbd5e1',
  },
  calDayNumSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },

  /* Time Adjuster with Ringing */
  timePickerContainer: {
    paddingVertical: 4,
  },
  inlineTimeAdjuster: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 6,
  },
  timeUnitCol: {
    alignItems: 'center',
  },
  timeUnitLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  counterRow: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  counterBtn: {
    width: 34,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  counterBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4f46e5',
  },
  counterValueText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 4,
  },
  timeColon: {
    fontSize: 20,
    fontWeight: '800',
    color: '#64748b',
    marginTop: 10,
  },
  ampmToggleRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 3,
    gap: 4,
  },
  ampmBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  ampmBtnActive: {
    backgroundColor: '#4f46e5',
  },
  ampmBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  ampmBtnTextActive: {
    color: '#ffffff',
  },
  soundOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  soundOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  soundToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  soundToggleActive: {
    backgroundColor: '#e0e7ff',
  },
  soundToggleSilent: {
    backgroundColor: '#f1f5f9',
  },
  soundToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338ca',
  },

  /* Analytics & Graph View Styles */
  analyticsHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  analyticsTargetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  analyticsMetricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
  },
  metricCardValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#4f46e5',
  },
  metricCardValueGreen: {
    fontSize: 24,
    fontWeight: '800',
    color: '#10b981',
  },
  metricCardSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  analyticsRangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rangeBtnActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  rangeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  rangeBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  detailedGraphCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailedGraphTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  detailedGraphSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 16,
  },
  detailedGraphBars: {
    paddingVertical: 10,
    paddingRight: 10,
  },
  detailedBarCol: {
    alignItems: 'center',
    width: 32,
    marginRight: 6,
  },
  detailedBarSlot: {
    height: 70,
    width: 22,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginBottom: 8,
  },
  detailedBarFill: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  detailedDayText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  detailedDateText: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBox: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  dangerDeleteBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    marginTop: 8,
  },
  dangerDeleteBtnText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '700',
  },
  // Month Schedule Styles
  monthScheduleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  monthScheduleHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  calWeekDayLabelLarge: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    paddingVertical: 6,
  },
  calDayCellSchedule: {
    width: '14.28%',
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  calDayCellScheduleSelected: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#3b82f6',
  },
  calDayCellToday: {
    backgroundColor: '#f8fafc',
  },
  calDayNumSchedule: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  calDayNumScheduleSelected: {
    color: '#1d4ed8',
    fontWeight: '800',
  },
  calDayNumToday: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  scheduleDayBadge: {
    marginTop: 2,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  scheduleDayBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
  },
  scheduleDayBadgeComplete: {
    color: '#059669',
  },
  scheduleDayEmptyDot: {
    fontSize: 10,
    color: '#cbd5e1',
    marginTop: 2,
  },
  scheduleDetailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  scheduleDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 12,
  },
  scheduleDetailsDateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  scheduleDetailsSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  scheduleJumpBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  scheduleJumpBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  scheduleEmptyDay: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  scheduleEmptyDayText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  scheduleTargetList: {
    gap: 10,
  },
  scheduleTargetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  checkboxSmall: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkmarkSmall: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  scheduleTargetTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
});
