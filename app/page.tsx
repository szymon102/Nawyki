// @ts-nocheck
/* eslint-disable */
'use client';

import { useState, useEffect } from 'react';
import { auth, provider, signInWithPopup, signOut, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

const getLast7Days = () => {
  const days = [];
  const today = new Date();
  if (today.getHours() < 4) today.setDate(today.getDate() - 1);
  const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    days.push({
      id: 6 - i, name: dayNames[d.getDay()], date: d.getDate(),
      fullDate: dateString, locked: i > 1, isToday: i === 0
    });
  }
  return days;
};

// NOWOŚĆ: Funkcja generująca 14 dat obecnego sprintu do precyzyjnego liczenia punktów
const getSprintDates = (startDateStr) => {
  const dates = [];
  const start = new Date(startDateStr);
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
};

const RANDOM_STAKE = '🎲 Tajemnicze Losowanie';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // UI STATES
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState(null); 
  const [showRivalHabits, setShowRivalHabits] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const weekDays = getLast7Days();
  const [activeDayIndex, setActiveDayIndex] = useState(6); 
  const activeDay = weekDays[activeDayIndex];
  const isLocked = activeDay.locked;

  // USER DATA & SYNC
  const [isReady, setIsReady] = useState(false);
  const [isReadyToEnd, setIsReadyToEnd] = useState(false); 
  const [notifications, setNotifications] = useState([]);
  const [habits, setHabits] = useState([]); 
  const [history, setHistory] = useState({});
  const [myCode, setMyCode] = useState('');
  const [rivalId, setRivalId] = useState(null);
  
  // FORMS
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitType, setNewHabitType] = useState('daily');
  const [newHabitTarget, setNewHabitTarget] = useState(3);
  const [rivalInput, setRivalInput] = useState('');
  
  // RIVAL DATA SYNC
  const [rivalData, setRivalData] = useState(null);

  // META-GRA
  const defaultPool = [
    'Przegrany zaprasza do restauracji', 
    'Kawa i ciastko na następne spotkanie', 
    'Własnoręczny posiłek lub wypiek', 
    'Kupon na darmową przysługę',
    'Immunitet decyzyjny',
    'Karny trening (pompki/przysiady)'
  ];
  const defaultRewards = {
    seasonActive: false, // Oznacza, że sezon trwa (niezależnie od tego który to sprint)
    sprintStart: weekDays[6].fullDate,
    stake: RANDOM_STAKE,
    seasonPrize: 'Weekendowy wyjazd',
    myWins: 0,
    rivalWins: 0,
    pool: defaultPool,
    drawnPrize: null 
  };
  const [rewards, setRewards] = useState(defaultRewards);
  
  const [editStake, setEditStake] = useState('');
  const [editSeasonPrize, setEditSeasonPrize] = useState('');
  const [rewardPool, setRewardPool] = useState(defaultPool);
  const [newRewardInput, setNewRewardInput] = useState('');

  // END SPRINT ANIMATION & FREEZE
  const [showEndModal, setShowEndModal] = useState(false);
  const [frozenPoints, setFrozenPoints] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawItem, setCurrentDrawItem] = useState('');
  const [finalDrawItem, setFinalDrawItem] = useState('');

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubMe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setHabits(data.habits || []);
        setHistory(data.history || {});
        setRivalId(data.rivalId || null);
        setIsReady(data.isReady || false);
        setIsReadyToEnd(data.isReadyToEnd || false);
        setNotifications(data.notifications || []);
        
        const loadedRewards = data.rewards || defaultRewards;
        if (loadedRewards.seasonActive === undefined) loadedRewards.seasonActive = false;
        
        setRewards(loadedRewards);
        setEditStake(loadedRewards.stake || defaultRewards.stake);
        setEditSeasonPrize(loadedRewards.seasonPrize || defaultRewards.seasonPrize);
        setRewardPool(loadedRewards.pool || defaultPool);
        
        const displayName = user.displayName?.split(' ')[0] || 'Gracz';
        if (!data.inviteCode) {
          const newCode = user.uid.substring(0, 5).toUpperCase();
          saveDataToCloud({ inviteCode: newCode, displayName }, user.uid);
          setMyCode(newCode);
        } else { 
          setMyCode(data.inviteCode);
          if (data.displayName !== displayName) saveDataToCloud({ displayName }, user.uid); 
        }
      } else {
        const newCode = user.uid.substring(0, 5).toUpperCase();
        const displayName = user.displayName?.split(' ')[0] || 'Gracz';
        saveDataToCloud({ inviteCode: newCode, displayName, isReady: false, isReadyToEnd: false, habits: [], history: {}, notifications: [], rewards: defaultRewards }, user.uid);
      }
      setLoading(false);
    });
    return () => unsubMe();
  }, [user]);

  useEffect(() => {
    if (!rivalId) return;
    const unsubRival = onSnapshot(doc(db, 'users', rivalId), (docSnap) => {
      if (docSnap.exists()) setRivalData(docSnap.data());
    });
    return () => unsubRival();
  }, [rivalId]);

  const saveDataToCloud = async (newData, customUid = null) => {
    const targetUid = customUid || (user ? user.uid : null);
    if (!targetUid) return;
    const docRef = doc(db, 'users', targetUid);
    await setDoc(docRef, newData, { merge: true });
  };

  const notifyRival = async (type, text, habitInfo = null) => {
    if (!rivalId || !rivalData) return;
    const newNotif = { id: Date.now().toString(), type, text, habitInfo, read: false, timestamp: new Date().toISOString() };
    const rivalNotifs = rivalData.notifications || [];
    await saveDataToCloud({ notifications: [newNotif, ...rivalNotifs].slice(0, 20) }, rivalId);
  };

  const closeNotificationsAndMarkRead = async () => {
    setShowNotifications(false);
    const hasUnread = notifications.some(n => !n.read);
    if (hasUnread) {
      const updated = notifications.map(n => ({ ...n, read: true }));
      await saveDataToCloud({ notifications: updated });
    }
  };

  const acceptHabitFromNotif = async (habitInfo, notifId) => {
    const updatedNotifs = notifications.map(n => n.id === notifId ? { ...n, read: true, accepted: true } : n);
    await saveDataToCloud({ notifications: updatedNotifs });
    notifyRival('INFO', `Zatwierdził(a) Twój nowy cel: ${habitInfo.name} - powodzenia!`);
  };

  const handleSetReady = async () => {
    if (rivalData?.isReady) {
      const today = new Date();
      if (today.getHours() < 4) today.setDate(today.getDate() - 1);
      const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const newSprintRewards = { ...rewards, seasonActive: true, sprintStart: dateString, drawnPrize: null };
      
      await saveDataToCloud({ isReady: false, rewards: newSprintRewards });
      const mirroredRewards = { ...newSprintRewards, myWins: newSprintRewards.rivalWins, rivalWins: newSprintRewards.myWins };
      await saveDataToCloud({ isReady: false, rewards: mirroredRewards }, rivalId);
      
      notifyRival('INFO', 'Rozpoczął/ęła nasz Sezon! Pierwszy sprint wystartował!');
    } else {
      await saveDataToCloud({ isReady: true });
      notifyRival('INFO', 'Zgłosił(a) gotowość do rozpoczęcia sezonu!');
    }
  };

  const calculateSprintDay = () => {
    const start = new Date(rewards.sprintStart);
    start.setHours(0,0,0,0);
    const today = new Date();
    if (today.getHours() < 4) today.setDate(today.getDate() - 1);
    today.setHours(0,0,0,0);
    const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + 1 : 1;
  };
  const currentSprintDay = calculateSprintDay();

  const addRewardToPool = () => {
    if (!newRewardInput.trim()) return;
    const updatedPool = [...rewardPool, newRewardInput.trim()];
    setRewardPool(updatedPool);
    setNewRewardInput('');
  };

  const removeRewardFromPool = (indexToRemove) => {
    const updatedPool = rewardPool.filter((_, idx) => idx !== indexToRemove);
    setRewardPool(updatedPool);
  };

  const saveRewards = async () => {
    const updatedRewards = { ...rewards, stake: editStake, seasonPrize: editSeasonPrize, pool: rewardPool };
    setRewards(updatedRewards);
    await saveDataToCloud({ rewards: updatedRewards });
    if (rivalId) {
      const mirroredRewards = { ...updatedRewards, myWins: updatedRewards.rivalWins, rivalWins: updatedRewards.myWins };
      await saveDataToCloud({ rewards: mirroredRewards }, rivalId);
    }
    setActiveSettingsTab(null);
  };

  const resetSeasonScore = async () => {
    const confirmReset = window.confirm("Czy na pewno chcesz wyzerować wyniki całego sezonu? Obie osoby wrócą do stanu 0:0.");
    if (!confirmReset) return;

    const updatedRewards = { ...rewards, myWins: 0, rivalWins: 0 };
    setRewards(updatedRewards);
    await saveDataToCloud({ rewards: updatedRewards });
    
    if (rivalId) {
      await saveDataToCloud({ rewards: updatedRewards }, rivalId);
      notifyRival('INFO', 'Wyzerował(a) wyniki sezonu. Zaczynamy zabawę od zera!');
    }
  };

  // NOWA LOGIKA LICZENIA PUNKTÓW: Zlicza TYLKO te dni, które należą do obecnego 14-dniowego okna sprintu
  const calculatePoints = (habitsList, historyData, sprintStartStr) => {
    if (!habitsList || !historyData || !sprintStartStr) return 0;
    let points = 0;
    let bonus = 0;
    const sprintDates = getSprintDates(sprintStartStr);

    // Punkty za dni
    sprintDates.forEach(dateStr => {
      if (historyData[dateStr]) {
        Object.keys(historyData[dateStr]).forEach(habitId => { if (historyData[dateStr][habitId]) points += 1; });
      }
    });

    // Punkty bonusowe za cele tygodniowe (sprawdzamy Tydzień 1 i Tydzień 2 bieżącego sprintu)
    habitsList.forEach(habit => {
      if (habit.type === 'weekly') {
        let week1Count = 0;
        let week2Count = 0;
        for(let i=0; i<7; i++) { if (historyData[sprintDates[i]] && historyData[sprintDates[i]][habit.id]) week1Count++; }
        for(let i=7; i<14; i++) { if (historyData[sprintDates[i]] && historyData[sprintDates[i]][habit.id]) week2Count++; }
        if (week1Count >= habit.target) bonus += 1;
        if (week2Count >= habit.target) bonus += 1;
      }
    });
    return points + bonus;
  };

  const myTotalPoints = calculatePoints(habits, history, rewards.sprintStart);
  const rivalTotalPoints = calculatePoints(rivalData?.habits, rivalData?.history, rivalData?.rewards?.sprintStart);
  const totalCombined = myTotalPoints + rivalTotalPoints;
  const myPercentage = totalCombined === 0 ? 50 : (myTotalPoints / totalCombined) * 100;

  // LOGIKA OBOPÓLNEGO FINAŁU
  const bothReadyToEnd = isReadyToEnd && rivalData?.isReadyToEnd;

  // Zarządzanie otwarciem i mrożeniem punktów
  useEffect(() => {
    if (bothReadyToEnd && !showEndModal) {
      setShowEndModal(true);
      setFrozenPoints({ my: myTotalPoints, rival: rivalTotalPoints });
    }
  }, [bothReadyToEnd, showEndModal]);

  // Synchronizacja kręcenia ruletką z bazy na żywo
  useEffect(() => {
    if (showEndModal && rewards.stake === RANDOM_STAKE && rewards.drawnPrize && !finalDrawItem && !isDrawing) {
      startRouletteAnimation(rewards.drawnPrize);
    }
  }, [showEndModal, rewards.stake, rewards.drawnPrize, finalDrawItem, isDrawing]);

  const startRouletteAnimation = (targetItem) => {
    setIsDrawing(true);
    let ticks = 0;
    const interval = setInterval(() => {
      setCurrentDrawItem(rewardPool[Math.floor(Math.random() * rewardPool.length)]);
      ticks++;
      if (ticks >= 25) {
        clearInterval(interval);
        setCurrentDrawItem(targetItem);
        setFinalDrawItem(targetItem);
        setIsDrawing(false);
      }
    }, 100);
  };

  const handleDrawClick = async () => {
    if (rewards.drawnPrize || isDrawing) return;
    const picked = rewardPool[Math.floor(Math.random() * rewardPool.length)];
    const updatedRewards = { ...rewards, drawnPrize: picked };
    
    await saveDataToCloud({ rewards: updatedRewards });
    if (rivalId) {
        const mirroredRewards = { ...updatedRewards, myWins: updatedRewards.rivalWins, rivalWins: updatedRewards.myWins };
        await saveDataToCloud({ rewards: mirroredRewards }, rivalId);
    }
  };

  const finalizeSprint = async () => {
    let newMyWins = rewards.myWins;
    let newRivalWins = rewards.rivalWins;
    
    const myPts = frozenPoints ? frozenPoints.my : myTotalPoints;
    const rivalPts = frozenPoints ? frozenPoints.rival : rivalTotalPoints;

    if (myPts > rivalPts) newMyWins += 1;
    else if (rivalPts > myPts) newRivalWins += 1;

    // Przesuwamy okno startu sprintu o 14 dni do przodu
    const d = new Date(rewards.sprintStart);
    d.setDate(d.getDate() + 14);
    const newStartStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const newSprintRewards = {
      ...rewards, 
      sprintStart: newStartStr, // Płynne wejście w nowy sprint!
      drawnPrize: null,
      myWins: newMyWins, 
      rivalWins: newRivalWins
    };
    
    // Zamykamy lokalnie żeby zapobiec migotaniu
    setIsReadyToEnd(false);
    setShowEndModal(false);
    setFrozenPoints(null);
    setFinalDrawItem('');

    await saveDataToCloud({ isReadyToEnd: false, rewards: newSprintRewards });
  };

  const connectToRival = async () => {
    if (!rivalInput || rivalInput.length !== 5) return alert("Wpisz poprawny kod.");
    if (rivalInput === myCode) return alert("Nie możesz połączyć się sam ze sobą!");
    try {
      const q = query(collection(db, 'users'), where('inviteCode', '==', rivalInput));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return alert("Nie znaleziono rywala.");
      
      const foundRivalId = querySnapshot.docs[0].id;
      await saveDataToCloud({ rivalId: foundRivalId });
      setRivalId(foundRivalId);
      await setDoc(doc(db, 'users', foundRivalId), { rivalId: user.uid }, { merge: true });
      setActiveSettingsTab(null);
    } catch (error) { alert("Błąd łączenia."); }
  };

  const addHabit = () => {
    if (!newHabitName.trim()) return;
    const newHabit = { id: Date.now().toString(), name: newHabitName, type: newHabitType, target: newHabitType === 'weekly' ? Number(newHabitTarget) : 7 };
    const updatedHabits = [...habits, newHabit];
    saveDataToCloud({ habits: updatedHabits });
    notifyRival('NEW_HABIT', `Dodał(a) nowy cel do weryfikacji: ${newHabit.name}`, newHabit);
    setNewHabitName('');
  };

  const removeHabit = (idToRemove) => {
    const updatedHabits = habits.filter(h => h.id !== idToRemove);
    saveDataToCloud({ habits: updatedHabits });
  };

  const toggleHabit = (habitId) => {
    if (isLocked) return;
    const activeDateString = activeDay.fullDate;
    const currentDayData = history[activeDateString] || {};
    const isDone = currentDayData[habitId] || false;
    
    const newHistory = { ...history, [activeDateString]: { ...currentDayData, [habitId]: !isDone } };
    saveDataToCloud({ history: newHistory });
    
    if (!isDone && activeDay.isToday) {
      const habitObj = habits.find(h => h.id === habitId);
      if (habitObj) notifyRival('INFO', `Świetnie! Właśnie odhaczył(a) zadanie: ${habitObj.name}`);
    }
  };

  const handleLogin = async () => { try { await signInWithPopup(auth, provider); } catch (e) {} };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Wczytywanie...</div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center">
          <h1 className="text-4xl font-black mb-2 text-gray-900 tracking-tight">Nawyki</h1>
          <p className="text-gray-600 text-sm mb-8 font-medium">Zaloguj się, aby rozpocząć grę.</p>
          <button onClick={handleLogin} className="w-full bg-gradient-to-r from-violet-600 to-orange-500 text-white py-4 rounded-xl font-black text-lg hover:opacity-90 shadow-lg transition-all active:scale-95">
            Zaloguj przez Google
          </button>
        </div>
      </div>
    );
  }

  const rivalName = rivalData?.displayName || 'Rywal';
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 text-white font-sans relative overflow-x-hidden">
      
      {/* ----------------- GŁÓWNY EKRAN APLIKACJI ----------------- */}
      <div className="p-6 pb-24">
        
        {/* NAGŁÓWEK */}
        <header className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black tracking-tight drop-shadow-md">Cześć, {user.displayName?.split(' ')[0]}!</h1>
            <p className="text-white/80 text-sm mt-1 font-semibold bg-black/20 inline-block px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
              {rewards.seasonActive ? (
                 <>Sprint: <span className={currentSprintDay > 14 ? "text-yellow-300 font-black" : "text-white"}>Dzień {currentSprintDay} z 14</span></>
              ) : (
                 <span className="text-yellow-300 font-black">Oczekiwanie na sezon</span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowNotifications(true)} className="relative w-12 h-12 bg-white/20 rounded-full shadow-lg border border-white/30 flex items-center justify-center text-xl backdrop-blur-md hover:bg-white/30 transition-all active:scale-90">
              🔔
              {unreadCount > 0 && <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-fuchsia-600 shadow-md"></span>}
            </button>
            <button onClick={() => setShowSettings(true)} className="w-12 h-12 bg-white/20 rounded-full shadow-lg border border-white/30 flex items-center justify-center text-2xl backdrop-blur-md hover:bg-white/30 transition-all active:scale-90">
              ⚙️
            </button>
          </div>
        </header>

        {/* INFO O STAWCE */}
        <div className="mb-8 bg-black/20 backdrop-blur-md rounded-2xl px-4 py-3 flex items-center justify-between border border-white/10 shadow-lg">
          <span className="text-sm font-bold text-white/70 uppercase tracking-wider">🏆 O co gracie:</span>
          <span className={`font-black text-right truncate ml-2 ${rewards.stake === RANDOM_STAKE ? 'text-yellow-300 animate-pulse' : 'text-white'}`}>
            {rewards.stake}
          </span>
        </div>

        {/* --- POCZEKALNIA (JEŚLI SEZON NIE JEST AKTYWNY) --- */}
        {!rewards.seasonActive ? (
          <div className="bg-white/95 backdrop-blur-xl p-6 rounded-3xl shadow-2xl mb-8 border border-white/50 text-center text-gray-900">
            <h2 className="text-2xl font-black mb-2">Gotowi do startu? 🚀</h2>
            <p className="text-gray-500 text-sm mb-6 font-medium">Aby rozpocząć sezon, obie osoby muszą zgłosić gotowość.</p>
            
            {!rivalId ? (
              <button onClick={() => { setShowSettings(true); setActiveSettingsTab('rival'); }} className="bg-gradient-to-r from-violet-600 to-orange-500 text-white px-6 py-3 rounded-xl font-black text-sm hover:scale-105 transition-transform shadow-lg">
                Najpierw połącz się z rywalem!
              </button>
            ) : (
              <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="flex flex-col items-center flex-1">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Ty</span>
                  {isReady ? (
                    <span className="text-green-500 font-black text-lg">✓ Gotowy</span>
                  ) : (
                    <button onClick={handleSetReady} className="bg-violet-600 text-white px-4 py-2 rounded-xl font-black shadow-lg hover:bg-violet-700 active:scale-95 transition-all">Rozpocznij sezon</button>
                  )}
                </div>
                <div className="w-px h-16 bg-gray-200 mx-2"></div>
                <div className="flex flex-col items-center flex-1">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">{rivalName}</span>
                  {rivalData?.isReady ? (
                    <span className="text-green-500 font-black text-lg">✓ Gotowy</span>
                  ) : (
                    <span className="text-gray-400 font-bold mt-2 animate-pulse">Czeka...</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* --- WŁAŚCIWY SEZON UI --- */
          <>
            {/* OBUSTORNNE ZGŁASZANIE GOTOWOŚCI DO FINAŁU SPRINTU */}
            {currentSprintDay > 14 && (
              <div 
                onClick={async () => {
                  if (!isReadyToEnd) {
                    await saveDataToCloud({ isReadyToEnd: true });
                    notifyRival('INFO', 'Skończył(a) swój sprint. Czeka na Ciebie w finale!');
                  } else {
                    await saveDataToCloud({ isReadyToEnd: false }); 
                  }
                }} 
                className={`mb-8 p-5 rounded-3xl shadow-2xl text-center transition-all cursor-pointer ${!isReadyToEnd ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:scale-[1.02] animate-bounce' : 'bg-black/40 text-white border border-white/20 backdrop-blur-md'}`}
              >
                <p className="font-black text-xl uppercase tracking-widest">{!isReadyToEnd ? 'Czas na finał!' : `Czekam na ${rivalName}...`}</p>
                <p className={`text-sm font-bold mt-1 ${!isReadyToEnd ? 'opacity-80' : 'text-gray-300'}`}>
                  {!isReadyToEnd ? 'Jeśli odhaczyłeś zaległości z wczoraj, kliknij tu.' : 'Kliknij ponownie, aby cofnąć gotowość.'}
                </p>
              </div>
            )}

            <div className="bg-white/95 backdrop-blur-xl p-5 rounded-3xl shadow-2xl mb-8 border border-white/50 text-gray-900 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 to-orange-500"></div>
              <div className="flex justify-between text-base mb-4 font-black items-center">
                <span className={myTotalPoints >= rivalTotalPoints ? 'text-violet-600 text-lg' : 'text-gray-400'}>Ty: {myTotalPoints}</span>
                <span className={rivalTotalPoints >= myTotalPoints ? 'text-orange-500 text-lg' : 'text-gray-400'}>{rivalName}: {rivalTotalPoints}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 shadow-inner">
                <div className="bg-gradient-to-r from-violet-500 to-orange-500 h-4 rounded-full transition-all duration-1000 shadow-md" style={{ width: `${myPercentage}%` }}></div>
              </div>
            </div>

            <div className="flex justify-between items-center mb-8 bg-black/20 p-2 rounded-3xl shadow-inner backdrop-blur-sm border border-white/10">
              {weekDays.map((day) => (
                <div key={day.id} onClick={() => setActiveDayIndex(day.id)} className={`flex flex-col items-center justify-center w-11 h-16 rounded-2xl cursor-pointer transition-all ${activeDayIndex === day.id ? 'bg-white text-violet-600 shadow-lg scale-110' : 'text-white/60 hover:bg-white/10'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest mb-1">{day.name}</span>
                  <span className={`text-base font-black ${activeDayIndex === day.id ? 'text-violet-600' : 'text-white'}`}>{day.date}</span>
                  {day.isToday && activeDayIndex !== day.id && <div className="w-1.5 h-1.5 bg-orange-400 rounded-full mt-1 shadow-[0_0_8px_rgba(251,146,60,0.8)]"></div>}
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end mb-3 px-2">
                <h2 className="text-xl font-black drop-shadow-md">{activeDay.isToday ? 'Twoje cele' : `Historia: ${activeDay.name}, ${activeDay.date}`}</h2>
                {isLocked && <span className="text-xs font-black text-white/90 flex gap-1 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm border border-white/20">🔒 ODCZYT</span>}
              </div>

              {habits.length === 0 ? (
                <div className="text-center p-8 bg-black/20 backdrop-blur-sm rounded-3xl border border-white/20 shadow-lg">
                  <p className="text-sm font-semibold mb-3 text-white/80">Jeszcze nic tu nie ma.</p>
                  <button onClick={() => { setShowSettings(true); setActiveSettingsTab('habits'); }} className="bg-white text-violet-600 px-6 py-2 rounded-full font-black text-sm hover:scale-105 transition-transform shadow-lg">Dodaj pierwszy nawyk</button>
                </div>
              ) : (
                <div className={`transition-opacity duration-300 ${isLocked ? 'opacity-70' : 'opacity-100'}`}>
                  {habits.map(habit => {
                    const currentDayData = history[activeDay.fullDate] || {};
                    const isDone = currentDayData[habit.id] || false;
                    let weeklyCount = 0;
                    if (habit.type === 'weekly') {
                      weekDays.forEach(day => { if (history[day.fullDate] && history[day.fullDate][habit.id]) weeklyCount++; });
                    }
                    return (
                      <div key={habit.id} className="flex items-center justify-between bg-white/95 p-5 rounded-3xl shadow-xl mb-4 active:scale-[0.98] transition-transform border border-white/50 text-gray-900 relative overflow-hidden">
                        {isDone && <div className="absolute inset-0 bg-green-50/50"></div>}
                        <div className="relative z-10">
                          <p className={`font-black text-lg ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>{habit.name}</p>
                          <p className={`text-xs mt-1 font-bold ${habit.type === 'weekly' && weeklyCount >= habit.target ? 'text-green-500' : 'text-gray-500'}`}>
                            {habit.type === 'daily' ? 'Codziennie' : (weeklyCount >= habit.target ? 'Ukończono w tym tyg! 🎉' : `${weeklyCount} / ${habit.target} w tym tygodniu`)}
                          </p>
                        </div>
                        <div onClick={() => toggleHabit(habit.id)} className={`relative z-10 w-10 h-10 rounded-full border-4 flex items-center justify-center transition-all shadow-md ${isDone ? (isLocked ? 'bg-gray-400 border-gray-400' : 'bg-green-500 border-green-500 scale-110') : 'border-gray-200 bg-gray-50'} ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          {isDone && <span className="text-white text-xl font-black">✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* PODGLĄD NAWYKÓW RYWALA */}
            {rivalId && rivalData && (
              <div className="mt-8">
                <button 
                  onClick={() => setShowRivalHabits(!showRivalHabits)} 
                  className="w-full text-center text-white/80 hover:text-white font-black text-sm uppercase tracking-widest py-3 border-t border-white/20 transition-colors"
                >
                  {showRivalHabits ? '▲ Ukryj nawyki rywala ▲' : '▼ Podglądaj nawyki rywala ▼'}
                </button>
                
                {showRivalHabits && rivalData.habits && (
                  <div className="mt-4 space-y-3 opacity-60 grayscale-[40%] pointer-events-none transition-all duration-500">
                    <p className="text-center text-xs font-bold text-white/70 uppercase mb-2">Ekran: {rivalName}</p>
                    {rivalData.habits.length === 0 ? (
                      <p className="text-center text-sm italic text-white/50">{rivalName} nie ma jeszcze nawyków.</p>
                    ) : (
                      rivalData.habits.map(habit => {
                        const rivalDayData = (rivalData.history && rivalData.history[activeDay.fullDate]) || {};
                        const isDone = rivalDayData[habit.id] || false;
                        let weeklyCount = 0;
                        if (habit.type === 'weekly') {
                          weekDays.forEach(day => { if (rivalData.history && rivalData.history[day.fullDate] && rivalData.history[day.fullDate][habit.id]) weeklyCount++; });
                        }
                        return (
                          <div key={habit.id} className="flex items-center justify-between bg-white/40 p-4 rounded-2xl shadow-sm border border-white/10 text-gray-800">
                            <div>
                              <p className={`font-bold text-base ${isDone ? 'line-through text-gray-500' : 'text-gray-800'}`}>{habit.name}</p>
                              <p className="text-[10px] mt-0.5 font-bold text-gray-600">
                                {habit.type === 'daily' ? 'Codziennie' : `${weeklyCount} / ${habit.target} w tyg`}
                              </p>
                            </div>
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${isDone ? 'bg-gray-600 border-gray-600' : 'border-gray-400 bg-transparent'}`}>
                              {isDone && <span className="text-white text-sm font-bold">✓</span>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ----------------- MODAL POWIADOMIEŃ (DZWONEK) ----------------- */}
      {showNotifications && (
        <div className="fixed inset-0 bg-gray-50 text-gray-900 z-50 overflow-y-auto font-sans animate-fade-in">
          <div className="p-6 pb-20">
            <header className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
              <h2 className="text-3xl font-black tracking-tight">Aktywność</h2>
              <button onClick={closeNotificationsAndMarkRead} className="text-gray-500 font-black bg-gray-200 w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">
                ✕
              </button>
            </header>
            
            <div className="space-y-4">
              {notifications.length === 0 ? (
                <div className="text-center p-8 bg-white rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-5xl mb-4">📭</p>
                  <p className="text-gray-500 font-bold">Brak nowych powiadomień.</p>
                  <p className="text-sm text-gray-400 mt-2">Gdy {rivalName} coś zrobi, pojawi się to tutaj.</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} className={`p-5 rounded-3xl border ${notif.read ? 'bg-gray-50 border-gray-100' : 'bg-white border-violet-200 shadow-md'}`}>
                    <div className="flex gap-4 items-start">
                      <div className="text-2xl mt-1">{notif.type === 'NEW_HABIT' ? '🎯' : notif.type === 'INFO' ? '⚡' : '🔥'}</div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 mb-1">{notif.text}</p>
                        <p className="text-xs text-gray-400 font-medium">Od: {rivalName}</p>
                        
                        {notif.type === 'NEW_HABIT' && notif.habitInfo && !notif.accepted && (
                          <button onClick={() => acceptHabitFromNotif(notif.habitInfo, notif.id)} className="mt-3 bg-green-100 text-green-700 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-green-200 transition-colors w-full border border-green-200 shadow-sm active:scale-95">
                            ✓ Akceptuję ten cel (ma sens)
                          </button>
                        )}
                        {notif.accepted && (
                          <p className="mt-3 text-xs font-bold text-green-500 uppercase tracking-wider">✓ Zaakceptowano i wysłano potwierdzenie</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL USTAWIEŃ ----------------- */}
      {showSettings && (
        <div className="fixed inset-0 bg-gray-50 text-gray-900 z-40 overflow-y-auto font-sans">
          <div className="p-6 pb-20">
            <header className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
              <h2 className="text-3xl font-black tracking-tight">{activeSettingsTab === null ? 'Ustawienia' : 'Wróć'}</h2>
              <button onClick={() => { activeSettingsTab === null ? setShowSettings(false) : setActiveSettingsTab(null) }} className="text-gray-500 font-black bg-gray-200 w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">
                {activeSettingsTab === null ? '✕' : '←'}
              </button>
            </header>

            {activeSettingsTab === null && (
              <div className="space-y-4">
                <button onClick={() => setActiveSettingsTab('habits')} className="w-full bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex justify-between items-center hover:bg-gray-50 hover:scale-[1.02] transition-all text-left">
                  <div>
                    <p className="font-black text-xl text-violet-600">🎯 Zarządzaj Nawykami</p>
                    <p className="text-sm text-gray-500 mt-1 font-medium">Dodaj lub usuń swoje cele</p>
                  </div>
                  <span className="text-gray-300 text-2xl font-black">➔</span>
                </button>
                <button onClick={() => setActiveSettingsTab('rival')} className="w-full bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex justify-between items-center hover:bg-gray-50 hover:scale-[1.02] transition-all text-left">
                  <div>
                    <p className="font-black text-xl text-blue-500">🤝 Twój Rywal</p>
                    <p className="text-sm text-gray-500 mt-1 font-medium">Parowanie i statystyki</p>
                  </div>
                  <span className="text-gray-300 text-2xl font-black">➔</span>
                </button>
                <button onClick={() => setActiveSettingsTab('rewards')} className="w-full bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex justify-between items-center hover:bg-gray-50 hover:scale-[1.02] transition-all text-left">
                  <div>
                    <p className="font-black text-xl text-orange-500">🏆 Stawki i Nagrody</p>
                    <p className="text-sm text-gray-500 mt-1 font-medium">Zmień pulę i zresetuj sezon</p>
                  </div>
                  <span className="text-gray-300 text-2xl font-black">➔</span>
                </button>
                <button onClick={() => signOut(auth)} className="w-full border-2 border-gray-200 text-gray-500 font-black py-4 rounded-2xl mt-12 hover:bg-gray-100 transition-colors uppercase tracking-widest text-sm">
                  Wyloguj się
                </button>
              </div>
            )}

            {activeSettingsTab === 'habits' && (
              <section className="animate-fade-in">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <input type="text" placeholder="Nazwa (np. Książka 15 min)" className="w-full border-2 border-gray-100 p-4 rounded-xl mb-4 text-base font-bold bg-gray-50 focus:border-violet-500 outline-none" value={newHabitName} onChange={e => setNewHabitName(e.target.value)} />
                  <div className="flex gap-3 mb-4 text-sm font-bold">
                    <select className="border-2 border-gray-100 p-4 rounded-xl flex-1 bg-gray-50 focus:border-violet-500 outline-none" value={newHabitType} onChange={e => setNewHabitType(e.target.value)}>
                      <option value="daily">Codziennie</option>
                      <option value="weekly">W wybrane dni tygodnia</option>
                    </select>
                    {newHabitType === 'weekly' && <input type="number" min="1" max="6" className="border-2 border-gray-100 p-4 rounded-xl w-24 bg-gray-50 text-center focus:border-violet-500 outline-none" value={newHabitTarget} onChange={e => setNewHabitTarget(e.target.value)} />}
                  </div>
                  <button onClick={addHabit} className="w-full bg-violet-600 text-white py-4 rounded-xl font-black text-base hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200">WYŚLIJ CEL DO AKCEPTACJI</button>
                  
                  {habits.length > 0 && (
                    <div className="mt-8 pt-6 border-t-2 border-gray-50">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Aktualna lista:</h4>
                      {habits.map(h => (
                        <div key={h.id} className="flex justify-between items-center p-3 mb-2 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="font-bold">{h.name} <span className="text-gray-400 text-xs font-medium ml-1">({h.type === 'daily' ? 'Codziennie' : `${h.target}x w tyg`})</span></span>
                          <button onClick={() => removeHabit(h.id)} className="text-red-500 font-black px-3 py-1 bg-red-100 rounded-lg hover:bg-red-200 transition-colors">X</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeSettingsTab === 'rival' && (
              <section className="animate-fade-in">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
                  {rivalId ? (
                    <div>
                      <div className="w-20 h-20 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">🤝</div>
                      <p className="text-2xl font-black text-gray-900 mb-2">Połączono w parę</p>
                      <p className="text-base text-gray-500 mb-2">Grasz przeciwko: <span className="font-black text-black text-xl ml-1">{rivalName}</span></p>
                      <p className="text-xs text-gray-400 bg-gray-50 inline-block px-3 py-1 rounded-lg mt-4">Jego kod: ukryty dla bezpieczeństwa</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-widest">Twój kod zaproszenia:</p>
                      <p className="text-5xl font-black text-violet-600 bg-violet-50 py-6 rounded-2xl tracking-[0.2em] mb-8 border border-violet-100">{myCode}</p>
                      <div className="flex gap-2">
                        <input type="text" placeholder="KOD RYWALA" className="border-2 border-gray-200 p-4 rounded-xl flex-1 text-lg uppercase text-center bg-gray-50 font-black focus:border-violet-500 outline-none" maxLength="5" value={rivalInput} onChange={(e) => setRivalInput(e.target.value.toUpperCase())} />
                        <button onClick={connectToRival} className="bg-black text-white px-8 rounded-xl text-lg font-black hover:bg-gray-800 transition-colors">Połącz</button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeSettingsTab === 'rewards' && (
              <section className="animate-fade-in">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <div className="mb-6 bg-gradient-to-r from-orange-50 to-orange-100 p-5 rounded-2xl border border-orange-200 flex justify-center items-center text-center">
                    <div>
                      <p className="text-xs text-orange-600 font-black uppercase tracking-widest mb-1">Tabela Sezonu</p>
                      <p className="text-lg font-black text-gray-900">Ty: {rewards.myWins} <span className="text-gray-300 mx-2">|</span> {rivalName}: {rewards.rivalWins}</p>
                    </div>
                  </div>
                  
                  <div className="mb-8 text-center">
                     <button onClick={resetSeasonScore} className="text-xs text-red-500 font-black uppercase tracking-widest hover:text-red-700 underline underline-offset-4">
                       Wyzeruj tabelę sezonu (Start 0:0)
                     </button>
                  </div>

                  <div className="mb-8">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-3">Obecna stawka sprinterska:</label>
                    <input type="text" className="w-full border-2 border-gray-100 p-4 rounded-xl text-base font-bold text-black bg-gray-50 mb-3 focus:border-orange-400 outline-none" value={editStake} onChange={e => setEditStake(e.target.value)} />
                    <button onClick={() => setEditStake(RANDOM_STAKE)} className="w-full bg-purple-100 text-purple-700 px-4 py-4 rounded-xl text-sm font-black hover:bg-purple-200 transition-colors border border-purple-200 shadow-sm">
                      🎲 Zamień na: Tajemnicze Losowanie
                    </button>
                  </div>

                  <div className="mb-8">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-3">Pula niespodzianek do losowania:</label>
                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-2">
                      {rewardPool.map((reward, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm p-3 bg-gray-50 rounded-xl border border-gray-100 font-medium">
                          <span onClick={() => setEditStake(reward)} className="cursor-pointer hover:text-orange-500 truncate mr-2 flex-1">{reward}</span>
                          <button onClick={() => removeRewardFromPool(idx)} className="text-red-400 font-black px-2 hover:text-red-600">X</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Wpisz nową nagrodę..." className="flex-1 border-2 border-gray-100 p-4 rounded-xl text-sm font-bold bg-gray-50 focus:border-orange-400 outline-none" value={newRewardInput} onChange={e => setNewRewardInput(e.target.value)} />
                      <button onClick={addRewardToPool} className="bg-gray-200 px-6 rounded-xl font-black text-xl hover:bg-gray-300 transition-colors">+</button>
                    </div>
                  </div>

                  <div className="mb-8 pt-6 border-t-2 border-gray-50">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-3">Nagroda główna za wygranie sezonu:</label>
                    <input type="text" className="w-full border-2 border-gray-100 p-4 rounded-xl text-base font-bold bg-gray-50 focus:border-orange-400 outline-none" value={editSeasonPrize} onChange={e => setEditSeasonPrize(e.target.value)} />
                  </div>

                  <button onClick={saveRewards} className="w-full bg-black text-white py-5 rounded-xl text-base font-black shadow-xl hover:bg-gray-800 transition-colors active:scale-95">ZAPISZ ZMIANY W GRZE</button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ----------------- MODAL CEREMONII ZAKOŃCZENIA SPRINTU ----------------- */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xl">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden text-gray-900 animate-fade-in">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-violet-500 to-orange-500"></div>
            
            <h2 className="text-4xl font-black mb-2 uppercase tracking-tight mt-2">Finał!</h2>
            
            <div className="flex justify-center gap-8 my-8 text-xl font-bold">
              <div className="flex flex-col items-center">
                <span className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">Ty</span>
                <span className={frozenPoints?.my >= frozenPoints?.rival ? 'text-violet-600 text-5xl font-black' : 'text-gray-300 text-4xl'}>{frozenPoints?.my}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">{rivalName}</span>
                <span className={frozenPoints?.rival >= frozenPoints?.my ? 'text-orange-500 text-5xl font-black' : 'text-gray-300 text-4xl'}>{frozenPoints?.rival}</span>
              </div>
            </div>

            <div className="text-2xl font-black mb-8 uppercase tracking-widest bg-gray-50 py-4 rounded-2xl border border-gray-100 shadow-inner">
              {frozenPoints?.my > frozenPoints?.rival ? <span className="text-violet-600">Wygrywasz! 🎉</span> : frozenPoints?.rival > frozenPoints?.my ? <span className="text-orange-500">Przegrywasz... 📉</span> : <span className="text-blue-500">Remis! 🤝</span>}
            </div>

            {rewards.stake === RANDOM_STAKE && (
              <div className="mb-8 min-h-[140px] flex flex-col justify-center">
                {!isDrawing && !rewards.drawnPrize && (
                  <button onClick={handleDrawClick} className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white py-5 rounded-2xl text-xl font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 shadow-xl shadow-purple-200">
                    🎲 Losuj Nagrodę
                  </button>
                )}
                {isDrawing && <div className="text-3xl font-black text-purple-600 animate-pulse transition-all px-4">{currentDrawItem}</div>}
                {finalDrawItem && !isDrawing && (
                  <div className="animate-bounce mt-4 bg-purple-50 p-6 rounded-3xl border-2 border-purple-200">
                    <p className="text-xs font-black text-purple-400 uppercase tracking-widest mb-2">Do zrobienia:</p>
                    <p className="text-2xl font-black text-purple-700 leading-tight">{finalDrawItem}</p>
                  </div>
                )}
              </div>
            )}

            {rewards.stake !== RANDOM_STAKE && (
              <div className="mb-8 bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Stawka była ustalona:</p>
                <p className="text-xl font-black text-gray-900 leading-tight">{rewards.stake}</p>
              </div>
            )}

            {(rewards.stake !== RANDOM_STAKE || finalDrawItem) && (
              <button onClick={finalizeSprint} className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-gray-800 transition-colors active:scale-95 text-sm">
                Zacznij kolejny sprint
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}