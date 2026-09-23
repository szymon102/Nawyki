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

const RANDOM_STAKE = '🎲 Tajemnicze Losowanie na koniec';

export default function Home() {
  // POPRAWKI TYPESCRIPT (<any>)
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // UI STATES
  const [showSettings, setShowSettings] = useState(false);

  const weekDays = getLast7Days();
  const [activeDayIndex, setActiveDayIndex] = useState(6); 
  const activeDay = weekDays[activeDayIndex];
  const isLocked = activeDay.locked;

  // NAWYKI I HISTORIA
  const [habits, setHabits] = useState<any[]>([]); 
  const [history, setHistory] = useState<any>({});
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitType, setNewHabitType] = useState('daily');
  const [newHabitTarget, setNewHabitTarget] = useState(3);

  // RYWAl I PAROWANIE
  const [myCode, setMyCode] = useState('');
  const [rivalId, setRivalId] = useState<any>(null);
  const [rivalInput, setRivalInput] = useState('');
  const [rivalData, setRivalData] = useState<any>(null);

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
  const [rewards, setRewards] = useState<any>(defaultRewards);
  
  const [editStake, setEditStake] = useState('');
  const [editSeasonPrize, setEditSeasonPrize] = useState('');
  const [rewardPool, setRewardPool] = useState<any[]>(defaultPool);
  const [newRewardInput, setNewRewardInput] = useState('');

  // STANY DLA ANIMACJI ZAKOŃCZENIA SPRINTU
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
            saveDataToCloud({ inviteCode: newCode }, currentUser.uid);
            setMyCode(newCode);
          } else { setMyCode(data.inviteCode); }
        } else {
          const newCode = currentUser.uid.substring(0, 5).toUpperCase();
          saveDataToCloud({ inviteCode: newCode, habits: [], history: {}, rewards: defaultRewards }, currentUser.uid);
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

  const saveDataToCloud = async (newData: any, customUid: string | null = null) => {
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

  const removeRewardFromPool = (indexToRemove: number) => {
    const updatedPool = rewardPool.filter((_, idx) => idx !== indexToRemove);
    setRewardPool(updatedPool);
  };

  const saveRewards = async () => {
    const updatedRewards = { 
      ...rewards, 
      stake: editStake, 
      seasonPrize: editSeasonPrize,
      pool: rewardPool
    };
    setRewards(updatedRewards);
    await saveDataToCloud({ rewards: updatedRewards });
    
    if (rivalId) {
      const mirroredRewards = { ...updatedRewards, myWins: updatedRewards.rivalWins, rivalWins: updatedRewards.myWins };
      await saveDataToCloud({ rewards: mirroredRewards }, rivalId);
    }
    alert('Zapisano ustawienia sprintu!');
  };

  const calculatePoints = (habitsList: any[], historyData: any) => {
    if (!habitsList || !historyData) return 0;
    let points = 0;
    let bonus = 0;
    Object.values(historyData).forEach((day: any) => {
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
    setFinalDrawItem('');
    setCurrentDrawItem('');
    setShowEndModal(true);
  };

  const startRouletteAnimation = () => {
    if (rewardPool.length === 0) {
      setFinalDrawItem("Brak nagród w puli!");
      return;
    }
    setIsDrawing(true);
    let ticks = 0;
    const maxTicks = 25; 
    
    const interval = setInterval(() => {
      const randomItem = rewardPool[Math.floor(Math.random() * rewardPool.length)];
      setCurrentDrawItem(randomItem);
      ticks++;
      
      if (ticks >= maxTicks) {
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
      ...rewards,
      sprintStart: weekDays[6].fullDate, 
      stake: rewards.stake === RANDOM_STAKE ? RANDOM_STAKE : finalDrawItem || rewards.stake,
      myWins: newMyWins,
      rivalWins: newRivalWins,
      pool: rewardPool
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
      alert("Połączono!");
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

  const removeHabit = (idToRemove: string) => {
    const updatedHabits = habits.filter(h => h.id !== idToRemove);
    setHabits(updatedHabits);
    saveDataToCloud({ habits: updatedHabits });
  };

  const toggleHabit = (habitId: string) => {
    if (isLocked) return;
    const activeDateString = activeDay.fullDate;
    const currentDayData = history[activeDateString] || {};
    const isDone = currentDayData[habitId] || false;
    const newHistory = { ...history, [activeDateString]: { ...currentDayData, [habitId]: !isDone } };
    setHistory(newHistory);
    saveDataToCloud({ history: newHistory });
  };

  const handleLogin = async () => { try { await signInWithPopup(auth, provider); } catch (e) {} };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Wczytywanie...</div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-sm w-full text-center">
          <h1 className="text-3xl font-bold mb-2">Nawyki</h1>
          <p className="text-gray-500 text-sm mb-8">Zaloguj się, aby rywalizować.</p>
          <button onClick={handleLogin} className="w-full bg-black text-white py-3 rounded-xl font-semibold">Zaloguj przez Google</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans relative">
      
      {/* ----------------- GŁÓWNY EKRAN APLIKACJI ----------------- */}
      <div className="p-6 pb-20">
        
        {/* NAGŁÓWEK MINIMALISTYCZNY */}
        <header className="mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cześć, {user.displayName?.split(' ')[0]}!</h1>
            <p className="text-gray-500 text-xs mt-0.5 font-medium">
              Sprint: Dzień <span className={currentSprintDay > 14 ? "text-red-600 font-bold" : ""}>{currentSprintDay} z 14</span>
            </p>
          </div>
          <button 
            onClick={() => setShowSettings(true)} 
            className="w-10 h-10 bg-white rounded-full shadow-sm border border-gray-200 flex items-center justify-center text-lg hover:bg-gray-50 transition-colors"
          >
            ⚙️
          </button>
        </header>

        {/* INFO O STAWCE (Bardzo dyskretne) */}
        <div className="mb-6 bg-gray-100 rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-semibold text-gray-600">
          <span>🏆 Stawka:</span>
          <span className={`text-black ${rewards.stake === RANDOM_STAKE ? 'text-purple-600 animate-pulse' : ''}`}>
            {rewards.stake}
          </span>
        </div>

        {/* BANER PRZYPOMINAJĄCY O KOŃCU SPRINTU */}
        {currentSprintDay > 14 && (
          <div onClick={triggerEndSprintFlow} className="mb-6 bg-red-600 text-white p-4 rounded-2xl shadow-lg cursor-pointer text-center animate-pulse hover:bg-red-700 transition-colors">
            <p className="font-black text-lg uppercase tracking-wider">Czas minął!</p>
            <p className="text-sm font-medium mt-1 text-red-100">Kliknij, aby podsumować sprint</p>
          </div>
        )}

        {/* PASEK POSTĘPU (Scoreboard) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 border border-gray-100">
          <div className="flex justify-between text-sm mb-3 font-semibold items-center">
            <span className={myTotalPoints >= rivalTotalPoints ? 'text-black' : 'text-gray-500'}>Ty: {myTotalPoints} pkt</span>
            <span className={rivalTotalPoints >= myTotalPoints ? 'text-black' : 'text-gray-400'}>Rywal: {rivalTotalPoints} pkt</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className="bg-black h-3 rounded-full transition-all duration-1000" style={{ width: `${myPercentage}%` }}></div>
          </div>
        </div>

        {/* KALENDARZ */}
        <div className="flex justify-between items-center mb-8 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
          {weekDays.map((day) => (
            <div key={day.id} onClick={() => setActiveDayIndex(day.id)} className={`flex flex-col items-center justify-center w-10 h-14 rounded-xl cursor-pointer ${activeDayIndex === day.id ? 'bg-black text-white' : 'text-gray-400 hover:bg-gray-100'}`}>
              <span className="text-[10px] font-bold uppercase">{day.name}</span>
              <span className={`text-sm font-semibold ${activeDayIndex === day.id ? 'text-white' : 'text-gray-800'}`}>{day.date}</span>
              {day.isToday && activeDayIndex !== day.id && <div className="w-1 h-1 bg-black rounded-full mt-1"></div>}
            </div>
          ))}
        </div>

        {/* TWOJE DYNAMICZNE NAWYKI */}
        <div className="space-y-4">
          <div className="flex justify-between items-end mb-2">
            <h2 className="text-lg font-semibold">{activeDay.isToday ? 'Dzisiejsze cele' : `Historia: ${activeDay.name}, ${activeDay.fullDate}`}</h2>
            {isLocked && <span className="text-xs font-bold text-gray-400 flex gap-1 bg-gray-200 px-2 py-1 rounded-md">🔒 ODCZYT</span>}
          </div>

          {habits.length === 0 ? (
            <div className="text-center p-6 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
              <p className="text-sm font-medium mb-2">Brak nawyków na liście.</p>
              <button onClick={() => setShowSettings(true)} className="text-blue-600 font-bold text-sm">Przejdź do ustawień, aby dodać</button>
            </div>
          ) : (
            <div className={`transition-opacity duration-300 ${isLocked ? 'opacity-60 grayscale-[30%]' : 'opacity-100'}`}>
              {habits.map(habit => {
                const currentDayData = history[activeDay.fullDate] || {};
                const isDone = currentDayData[habit.id] || false;
                let weeklyCount = 0;
                if (habit.type === 'weekly') {
                  weekDays.forEach(day => { if (history[day.fullDate] && history[day.fullDate][habit.id]) weeklyCount++; });
                }
                return (
                  <div key={habit.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-3 active:scale-[0.98] transition-transform">
                    <div>
                      <p className="font-medium text-lg">{habit.name}</p>
                      <p className={`text-xs mt-0.5 font-semibold ${habit.type === 'weekly' && weeklyCount >= habit.target ? 'text-green-600' : 'text-gray-400'}`}>
                        {habit.type === 'daily' ? 'Codziennie' : (weeklyCount >= habit.target ? 'Ukończono na ten tydzień! 🎉' : `${weeklyCount} / ${habit.target} w tym tygodniu`)}
                      </p>
                    </div>
                    <div onClick={() => toggleHabit(habit.id)} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${isDone ? (isLocked ? 'bg-gray-500 border-gray-500' : 'bg-black border-black') : 'border-gray-300'} ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      {isDone && <span className="text-white text-sm">✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ----------------- MODAL USTAWIEŃ (Czysty ekran z konfiguracją) ----------------- */}
      {showSettings && (
        <div className="fixed inset-0 bg-gray-50 z-40 overflow-y-auto">
          <div className="p-6 pb-20">
            <header className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
              <h2 className="text-2xl font-bold">Ustawienia</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-500 font-bold bg-gray-200 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
            </header>

            {/* SEKCJA 1: NAWYKI */}
            <section className="mb-8">
              <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider mb-4">Twoje Nawyki</h3>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <input type="text" placeholder="Nazwa (np. Książka 15 min)" className="w-full border p-2 rounded-lg mb-3 text-sm bg-gray-50" value={newHabitName} onChange={e => setNewHabitName(e.target.value)} />
                <div className="flex gap-2 mb-3 text-sm">
                  <select className="border p-2 rounded-lg flex-1 bg-gray-50" value={newHabitType} onChange={e => setNewHabitType(e.target.value)}>
                    <option value="daily">Codzienny</option>
                    <option value="weekly">W tygodniu</option>
                  </select>
                  {newHabitType === 'weekly' && <input type="number" min="1" max="6" className="border p-2 rounded-lg w-16 bg-gray-50 text-center" value={newHabitTarget} onChange={e => setNewHabitTarget(e.target.value)} />}
                </div>
                <button onClick={addHabit} className="w-full bg-black text-white py-2 rounded-lg font-semibold text-sm">Dodaj do listy</button>
                
                {habits.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {habits.map(h => (
                      <div key={h.id} className="flex justify-between items-center p-2 border-b border-gray-50 text-sm">
                        <span>{h.name} <span className="text-gray-400 text-xs">({h.type === 'daily' ? 'Codziennie' : `${h.target}x`})</span></span>
                        <button onClick={() => removeHabit(h.id)} className="text-red-500 font-bold px-2">X</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* SEKCJA 2: RYWAl */}
            <section className="mb-8">
              <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider mb-4">Połączenie</h3>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                {rivalId ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-green-600 mb-1">Połączono z rywalem</p>
                    <p className="text-xs text-gray-400">Widzisz jego postępy na żywo.</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Twój kod: <span className="font-bold text-black bg-gray-100 px-2 py-0.5 rounded tracking-wider">{myCode}</span></p>
                    <div className="flex gap-2">
                      <input type="text" placeholder="KOD RYWALA" className="border p-2 rounded-lg flex-1 text-sm uppercase text-center bg-gray-50" maxLength="5" value={rivalInput} onChange={(e) => setRivalInput(e.target.value.toUpperCase())} />
                      <button onClick={connectToRival} className="bg-black text-white px-4 py-2 rounded-lg text-sm font-semibold">Połącz</button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* SEKCJA 3: NAGRODY I SPRINT */}
            <section className="mb-8">
              <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider mb-4">Stawki i Sezon</h3>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                
                <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">Wynik sezonu</p>
                    <p className="text-sm font-bold">Ty: {rewards.myWins} | Rywal: {rewards.rivalWins}</p>
                  </div>
                  <button onClick={triggerEndSprintFlow} className="bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-200">
                    Zakończ Sprint
                  </button>
                </div>

                <div className="mb-4">
                  <label className="text-xs font-bold text-gray-500 block mb-1">Wybrana stawka sprintu:</label>
                  <input type="text" className="w-full border p-2 rounded-lg text-sm font-semibold text-black bg-gray-50 mb-2" value={editStake} onChange={e => setEditStake(e.target.value)} />
                  <button onClick={() => setEditStake(RANDOM_STAKE)} className="w-full bg-purple-100 text-purple-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-purple-200 transition-colors">
                    🎲 Ustaw Tajemnicze Losowanie
                  </button>
                </div>

                <div className="mb-4">
                  <label className="text-xs font-bold text-gray-500 block mb-2">Pula nagród do losowania:</label>
                  <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
                    {rewardPool.map((reward, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs p-1.5 border-b border-gray-50">
                        <span onClick={() => setEditStake(reward)} className="cursor-pointer hover:text-blue-600 truncate mr-2">{reward}</span>
                        <button onClick={() => removeRewardFromPool(idx)} className="text-red-400 font-bold">X</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Nowa nagroda..." className="flex-1 border p-1.5 rounded-lg text-xs bg-gray-50" value={newRewardInput} onChange={e => setNewRewardInput(e.target.value)} />
                    <button onClick={addRewardToPool} className="bg-gray-200 px-3 rounded-lg text-xs font-bold">+</button>
                  </div>
                </div>

                <div className="mb-4 pt-4 border-t border-gray-100">
                  <label className="text-xs font-bold text-gray-500 block mb-1">Główna nagroda sezonu:</label>
                  <input type="text" className="w-full border p-2 rounded-lg text-sm bg-gray-50" value={editSeasonPrize} onChange={e => setEditSeasonPrize(e.target.value)} />
                </div>

                <button onClick={saveRewards} className="w-full bg-black text-white py-2.5 rounded-lg text-sm font-semibold">Zapisz ustawienia stawek</button>
              </div>
            </section>

            <button onClick={() => signOut(auth)} className="w-full border-2 border-gray-200 text-gray-500 font-semibold py-3 rounded-xl mb-10 hover:bg-gray-100">
              Wyloguj się
            </button>
          </div>
        </div>
      )}

      {/* ----------------- MODAL CEREMONII ZAKOŃCZENIA SPRINTU ----------------- */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <h2 className="text-3xl font-black mb-2 uppercase tracking-tight">Koniec Sprintu!</h2>
            
            <div className="flex justify-center gap-6 my-6 text-xl font-bold">
              <div className="flex flex-col items-center">
                <span className="text-gray-500 text-sm uppercase">Ty</span>
                <span className={myTotalPoints >= rivalTotalPoints ? 'text-black text-4xl' : 'text-gray-400 text-3xl'}>{myTotalPoints}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-gray-500 text-sm uppercase">Rywal</span>
                <span className={rivalTotalPoints >= myTotalPoints ? 'text-black text-4xl' : 'text-gray-400 text-3xl'}>{rivalTotalPoints}</span>
              </div>
            </div>

            <div className="text-xl font-bold text-blue-600 mb-6 uppercase tracking-wider">
              {myTotalPoints > rivalTotalPoints ? 'Wygrywasz! 🎉' : rivalTotalPoints > myTotalPoints ? 'Przegrywasz... 📉' : 'Remis! 🤝'}
            </div>

            <hr className="my-6 border-gray-100" />

            {rewards.stake === RANDOM_STAKE && (
              <div className="mb-6 min-h-[120px] flex flex-col justify-center">
                {!isDrawing && !finalDrawItem && (
                  <button onClick={startRouletteAnimation} className="w-full bg-purple-600 text-white py-4 rounded-xl text-lg font-black uppercase tracking-wider hover:bg-purple-700 transition-transform active:scale-95 shadow-lg shadow-purple-200">
                    🎲 Losuj Nagrodę!
                  </button>
                )}
                
                {isDrawing && (
                  <div className="text-2xl font-black text-purple-600 animate-pulse transition-all">
                    {currentDrawItem}
                  </div>
                )}

                {finalDrawItem && !isDrawing && (
                  <div className="animate-bounce">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Wylosowana stawka:</p>
                    <p className="text-2xl font-black text-black">{finalDrawItem}</p>
                  </div>
                )}
              </div>
            )}

            {rewards.stake !== RANDOM_STAKE && (
              <div className="mb-8">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Stawka tego sprintu:</p>
                <p className="text-lg font-bold">{rewards.stake}</p>
              </div>
            )}

            {(rewards.stake !== RANDOM_STAKE || finalDrawItem) && (
              <button onClick={finalizeSprint} className="w-full bg-black text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors">
                Rozdaj punkty i zacznij od nowa
              </button>
            )}

            {!isDrawing && !finalDrawItem && rewards.stake === RANDOM_STAKE && (
               <button onClick={() => setShowEndModal(false)} className="mt-4 text-sm text-gray-400 font-semibold hover:text-gray-600">Wróć do aplikacji</button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}