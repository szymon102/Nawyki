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

const RANDOM_STAKE = '🎲 Tajemnicze Losowanie';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // UI STATES
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState(null); 
  const [showRivalHabits, setShowRivalHabits] = useState(false); // NOWY STAN DLA PODGLĄDU

  const weekDays = getLast7Days();
  const [activeDayIndex, setActiveDayIndex] = useState(6); 
  const activeDay = weekDays[activeDayIndex];
  const isLocked = activeDay.locked;

  // NAWYKI I HISTORIA
  const [habits, setHabits] = useState([]); 
  const [history, setHistory] = useState({});
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitType, setNewHabitType] = useState('daily');
  const [newHabitTarget, setNewHabitTarget] = useState(3);

  // RYWAl I PAROWANIE
  const [myCode, setMyCode] = useState('');
  const [rivalId, setRivalId] = useState(null);
  const [rivalInput, setRivalInput] = useState('');
  const [rivalData, setRivalData] = useState(null);

  // META-GRA (SPRINTY I NAGRODY)
  const defaultPool = [
    'Przegrany zaprasza do restauracji', 
    'Kawa i ciastko na następne spotkanie', 
    'Własnoręczny posiłek lub wypiek', 
    'Kupon na darmową przysługę',
    'Immunitet decyzyjny',
    'Karny trening (pompki/przysiady)'
  ];
  const defaultRewards = {
    sprintStart: weekDays[6].fullDate,
    stake: RANDOM_STAKE,
    seasonPrize: 'Weekendowy wyjazd',
    myWins: 0,
    rivalWins: 0,
    pool: defaultPool
  };
  const [rewards, setRewards] = useState(defaultRewards);
  
  const [editStake, setEditStake] = useState('');
  const [editSeasonPrize, setEditSeasonPrize] = useState('');
  const [rewardPool, setRewardPool] = useState(defaultPool);
  const [newRewardInput, setNewRewardInput] = useState('');

  const [showEndModal, setShowEndModal] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawItem, setCurrentDrawItem] = useState('');
  const [finalDrawItem, setFinalDrawItem] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        
        const displayName = currentUser.displayName?.split(' ')[0] || 'Gracz';
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setHabits(data.habits || []);
          setHistory(data.history || {});
          setRivalId(data.rivalId || null);
          
          const loadedRewards = data.rewards || defaultRewards;
          setRewards(loadedRewards);
          setEditStake(loadedRewards.stake || defaultRewards.stake);
          setEditSeasonPrize(loadedRewards.seasonPrize || defaultRewards.seasonPrize);
          setRewardPool(loadedRewards.pool || defaultPool);
          
          if (!data.inviteCode) {
            const newCode = currentUser.uid.substring(0, 5).toUpperCase();
            saveDataToCloud({ inviteCode: newCode, displayName }, currentUser.uid);
            setMyCode(newCode);
          } else { 
            setMyCode(data.inviteCode);
            saveDataToCloud({ displayName }, currentUser.uid); 
          }
        } else {
          const newCode = currentUser.uid.substring(0, 5).toUpperCase();
          saveDataToCloud({ inviteCode: newCode, displayName, habits: [], history: {}, rewards: defaultRewards }, currentUser.uid);
          setMyCode(newCode);
          setEditStake(defaultRewards.stake);
          setEditSeasonPrize(defaultRewards.seasonPrize);
          setRewardPool(defaultPool);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!rivalId) return;
    const unsubscribe = onSnapshot(doc(db, 'users', rivalId), (docSnap) => {
      if (docSnap.exists()) setRivalData(docSnap.data());
    });
    return () => unsubscribe();
  }, [rivalId]);

  const saveDataToCloud = async (newData, customUid = null) => {
    const targetUid = customUid || (user ? user.uid : null);
    if (!targetUid) return;
    const docRef = doc(db, 'users', targetUid);
    await setDoc(docRef, newData, { merge: true });
  };

  const calculateSprintDay = () => {
    const start = new Date(rewards.sprintStart).getTime();
    const now = new Date(weekDays[6].fullDate).getTime();
    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
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
    const updatedRewards = { 
      ...rewards, stake: editStake, seasonPrize: editSeasonPrize, pool: rewardPool
    };
    setRewards(updatedRewards);
    await saveDataToCloud({ rewards: updatedRewards });
    if (rivalId) {
      const mirroredRewards = { ...updatedRewards, myWins: updatedRewards.rivalWins, rivalWins: updatedRewards.myWins };
      await saveDataToCloud({ rewards: mirroredRewards }, rivalId);
    }
    setActiveSettingsTab(null);
  };

  const calculatePoints = (habitsList, historyData) => {
    if (!habitsList || !historyData) return 0;
    let points = 0;
    let bonus = 0;
    Object.values(historyData).forEach((day) => {
      Object.keys(day).forEach(habitId => { if (day[habitId]) points += 1; });
    });
    habitsList.forEach(habit => {
      if (habit.type === 'weekly') {
        let weeklyCount = 0;
        weekDays.forEach(day => { if (historyData[day.fullDate] && historyData[day.fullDate][habit.id]) weeklyCount++; });
        if (weeklyCount >= habit.target) bonus += 1;
      }
    });
    return points + bonus;
  };

  const myTotalPoints = calculatePoints(habits, history);
  const rivalTotalPoints = calculatePoints(rivalData?.habits, rivalData?.history);
  const totalCombined = myTotalPoints + rivalTotalPoints;
  const myPercentage = totalCombined === 0 ? 50 : (myTotalPoints / totalCombined) * 100;

  const triggerEndSprintFlow = () => {
    const updatedRewards = { ...rewards, stake: editStake, seasonPrize: editSeasonPrize, pool: rewardPool };
    setRewards(updatedRewards);
    setShowSettings(false);
    setActiveSettingsTab(null);
    setFinalDrawItem('');
    setCurrentDrawItem('');
    setShowEndModal(true);
  };

  const startRouletteAnimation = () => {
    if (rewardPool.length === 0) return setFinalDrawItem("Brak nagród!");
    setIsDrawing(true);
    let ticks = 0;
    const interval = setInterval(() => {
      setCurrentDrawItem(rewardPool[Math.floor(Math.random() * rewardPool.length)]);
      ticks++;
      if (ticks >= 25) {
        clearInterval(interval);
        const finalItem = rewardPool[Math.floor(Math.random() * rewardPool.length)];
        setCurrentDrawItem(finalItem);
        setFinalDrawItem(finalItem);
        setIsDrawing(false);
      }
    }, 100);
  };

  const finalizeSprint = async () => {
    let newMyWins = rewards.myWins;
    let newRivalWins = rewards.rivalWins;
    if (myTotalPoints > rivalTotalPoints) newMyWins += 1;
    else if (rivalTotalPoints > myTotalPoints) newRivalWins += 1;

    const resetHistory = {}; 
    const newSprintRewards = {
      ...rewards, sprintStart: weekDays[6].fullDate, 
      stake: rewards.stake === RANDOM_STAKE ? RANDOM_STAKE : finalDrawItem || rewards.stake,
      myWins: newMyWins, rivalWins: newRivalWins, pool: rewardPool
    };
    setRewards(newSprintRewards);
    setHistory(resetHistory);
    await saveDataToCloud({ rewards: newSprintRewards, history: resetHistory });
    if (rivalId) {
      const mirroredRewards = { ...newSprintRewards, myWins: newRivalWins, rivalWins: newMyWins };
      await saveDataToCloud({ rewards: mirroredRewards, history: resetHistory }, rivalId);
    }
    setShowEndModal(false);
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
    setHabits(updatedHabits);
    saveDataToCloud({ habits: updatedHabits });
    setNewHabitName('');
  };

  const removeHabit = (idToRemove) => {
    const updatedHabits = habits.filter(h => h.id !== idToRemove);
    setHabits(updatedHabits);
    saveDataToCloud({ habits: updatedHabits });
  };

  const toggleHabit = (habitId) => {
    if (isLocked) return;
    const activeDateString = activeDay.fullDate;
    const currentDayData = history[activeDateString] || {};
    const isDone = currentDayData[habitId] || false;
    const newHistory = { ...history, [activeDateString]: { ...currentDayData, [habitId]: !isDone } };
    setHistory(newHistory);
    saveDataToCloud({ history: newHistory });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 text-white font-sans relative overflow-x-hidden">
      
      {/* ----------------- GŁÓWNY EKRAN APLIKACJI ----------------- */}
      <div className="p-6 pb-24">
        
        {/* NAGŁÓWEK */}
        <header className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black tracking-tight drop-shadow-md">Cześć, {user.displayName?.split(' ')[0]}!</h1>
            <p className="text-white/80 text-sm mt-1 font-semibold bg-black/20 inline-block px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
              Sprint: <span className={currentSprintDay > 14 ? "text-yellow-300 font-black" : "text-white"}>Dzień {currentSprintDay} z 14</span>
            </p>
          </div>
          <button onClick={() => setShowSettings(true)} className="w-12 h-12 bg-white/20 rounded-full shadow-lg border border-white/30 flex items-center justify-center text-2xl backdrop-blur-md hover:bg-white/30 transition-all active:scale-90">
            ⚙️
          </button>
        </header>

        {/* INFO O STAWCE */}
        <div className="mb-8 bg-black/20 backdrop-blur-md rounded-2xl px-4 py-3 flex items-center justify-between border border-white/10 shadow-lg">
          <span className="text-sm font-bold text-white/70 uppercase tracking-wider">🏆 O co gracie:</span>
          <span className={`font-black text-right truncate ml-2 ${rewards.stake === RANDOM_STAKE ? 'text-yellow-300 animate-pulse' : 'text-white'}`}>
            {rewards.stake}
          </span>
        </div>

        {/* BANER PRZYPOMINAJĄCY O KOŃCU SPRINTU */}
        {currentSprintDay > 14 && (
          <div onClick={triggerEndSprintFlow} className="mb-8 bg-gradient-to-r from-yellow-400 to-orange-500 text-black p-5 rounded-3xl shadow-2xl cursor-pointer text-center animate-bounce hover:scale-[1.02] transition-transform">
            <p className="font-black text-xl uppercase tracking-widest">Koniec czasu!</p>
            <p className="text-sm font-bold mt-1 opacity-80">Kliknij, aby rozstrzygnąć sprint</p>
          </div>
        )}

        {/* PASEK POSTĘPU (Scoreboard) */}
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

        {/* KALENDARZ */}
        <div className="flex justify-between items-center mb-8 bg-black/20 p-2 rounded-3xl shadow-inner backdrop-blur-sm border border-white/10">
          {weekDays.map((day) => (
            <div key={day.id} onClick={() => setActiveDayIndex(day.id)} className={`flex flex-col items-center justify-center w-11 h-16 rounded-2xl cursor-pointer transition-all ${activeDayIndex === day.id ? 'bg-white text-violet-600 shadow-lg scale-110' : 'text-white/60 hover:bg-white/10'}`}>
              <span className="text-[10px] font-black uppercase tracking-widest mb-1">{day.name}</span>
              <span className={`text-base font-black ${activeDayIndex === day.id ? 'text-violet-600' : 'text-white'}`}>{day.date}</span>
              {day.isToday && activeDayIndex !== day.id && <div className="w-1.5 h-1.5 bg-orange-400 rounded-full mt-1 shadow-[0_0_8px_rgba(251,146,60,0.8)]"></div>}
            </div>
          ))}
        </div>

        {/* TWOJE DYNAMICZNE NAWYKI */}
        <div className="space-y-4">
          <div className="flex justify-between items-end mb-3 px-2">
            <h2 className="text-xl font-black drop-shadow-md">{activeDay.isToday ? 'Twoje cele na dziś' : `Historia: ${activeDay.name}, ${activeDay.date}`}</h2>
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
                        {habit.type === 'daily' ? 'Codziennie' : (weeklyCount >= habit.target ? 'Ukończono na ten tydzień! 🎉' : `${weeklyCount} / ${habit.target} w tym tygodniu`)}
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

        {/* ----------------- PODGLĄD NAWYKÓW RYWALA (Wyszarzone/Półprzezroczyste) ----------------- */}
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
                <p className="text-center text-xs font-bold text-white/70 uppercase mb-2">Ekran {rivalName}</p>
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

      </div>

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

            {/* GŁÓWNE MENU USTAWIEŃ */}
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
                    <p className="text-sm text-gray-500 mt-1 font-medium">Parowanie i statystyki rywala</p>
                  </div>
                  <span className="text-gray-300 text-2xl font-black">➔</span>
                </button>

                <button onClick={() => setActiveSettingsTab('rewards')} className="w-full bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex justify-between items-center hover:bg-gray-50 hover:scale-[1.02] transition-all text-left">
                  <div>
                    <p className="font-black text-xl text-orange-500">🏆 Stawki i Nagrody</p>
                    <p className="text-sm text-gray-500 mt-1 font-medium">Zmień pulę i rozstrzygnij sprint</p>
                  </div>
                  <span className="text-gray-300 text-2xl font-black">➔</span>
                </button>

                <button onClick={() => signOut(auth)} className="w-full border-2 border-gray-200 text-gray-500 font-black py-4 rounded-2xl mt-12 hover:bg-gray-100 transition-colors uppercase tracking-widest text-sm">
                  Wyloguj się
                </button>
              </div>
            )}

            {/* POD-MENU: NAWYKI */}
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
                  <button onClick={addHabit} className="w-full bg-violet-600 text-white py-4 rounded-xl font-black text-base hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200">DODAJ DO LISTY</button>
                  
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

            {/* POD-MENU: RYWAL */}
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

            {/* POD-MENU: NAGRODY */}
            {activeSettingsTab === 'rewards' && (
              <section className="animate-fade-in">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <div className="mb-6 bg-gradient-to-r from-orange-50 to-orange-100 p-5 rounded-2xl border border-orange-200 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-orange-600 font-black uppercase tracking-widest mb-1">Tabela Sezonu</p>
                      <p className="text-lg font-black text-gray-900">Ty: {rewards.myWins} <span className="text-gray-300 mx-2">|</span> {rivalName}: {rewards.rivalWins}</p>
                    </div>
                    <button onClick={triggerEndSprintFlow} className="bg-orange-500 text-white px-5 py-3 rounded-xl text-sm font-black shadow-lg shadow-orange-200 hover:scale-105 transition-transform active:scale-95">
                      Finał Sprintu!
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
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden text-gray-900">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-violet-500 to-orange-500"></div>
            
            <h2 className="text-4xl font-black mb-2 uppercase tracking-tight mt-2">Finał!</h2>
            
            <div className="flex justify-center gap-8 my-8 text-xl font-bold">
              <div className="flex flex-col items-center">
                <span className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">Ty</span>
                <span className={myTotalPoints >= rivalTotalPoints ? 'text-violet-600 text-5xl font-black' : 'text-gray-300 text-4xl'}>{myTotalPoints}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">{rivalName}</span>
                <span className={rivalTotalPoints >= myTotalPoints ? 'text-orange-500 text-5xl font-black' : 'text-gray-300 text-4xl'}>{rivalTotalPoints}</span>
              </div>
            </div>

            <div className="text-2xl font-black mb-8 uppercase tracking-widest bg-gray-50 py-4 rounded-2xl border border-gray-100">
              {myTotalPoints > rivalTotalPoints ? <span className="text-violet-600">Wygrywasz! 🎉</span> : rivalTotalPoints > myTotalPoints ? <span className="text-orange-500">Przegrywasz... 📉</span> : <span className="text-blue-500">Remis! 🤝</span>}
            </div>

            {rewards.stake === RANDOM_STAKE && (
              <div className="mb-8 min-h-[140px] flex flex-col justify-center">
                {!isDrawing && !finalDrawItem && (
                  <button onClick={startRouletteAnimation} className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white py-5 rounded-2xl text-xl font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 shadow-xl shadow-purple-200">
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
                Zakończ i rozdaj punkty
              </button>
            )}

            {!isDrawing && !finalDrawItem && rewards.stake === RANDOM_STAKE && (
               <button onClick={() => setShowEndModal(false)} className="mt-6 text-sm text-gray-400 font-bold uppercase tracking-widest hover:text-gray-600">Wróć (Anuluj)</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}