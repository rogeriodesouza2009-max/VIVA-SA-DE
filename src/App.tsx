import React, { useEffect, useState, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  deleteDoc,
  doc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  Timestamp,
  where,
  getDocs,
  writeBatch 
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User,
  setPersistence,
  browserLocalPersistence 
} from 'firebase/auth';
import { 
  Download,
  Activity, 
  Heart, 
  Droplet, 
  Clock, 
  ChevronRight, 
  LogOut, 
  User as UserIcon, 
  History,
  AlertCircle,
  Plus,
  Trash2,
  Info,
  X,
  Smartphone,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import { db, auth } from './lib/firebase';
import { HealthReading, HealthStatus, MealPeriod } from './types';
import { cn, handleFirestoreError } from './lib/utils';

const BR_TIMEZONE = 'America/Sao_Paulo';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [readings, setReadings] = useState<HealthReading[]>([]);
  const [logoClicks, setLogoClicks] = useState(0);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [highlightPeriods, setHighlightPeriods] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [formData, setFormData] = useState({
    glucose: '',
    systolic: '',
    diastolic: '',
    bpm: '',
    period: '' as MealPeriod | ''
  });

  const formatDateBR = (timestamp: any) => {
    try {
      if (!timestamp) return '--/--/---- --:--';
      const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
      
      // Basic validity check
      if (isNaN(date.getTime())) return '--/--/---- --:--';
      
      const zonedDate = toZonedTime(date, BR_TIMEZONE);
      return format(zonedDate, "dd/MM/yyyy HH:mm");
    } catch (err) {
      console.error("Format date error:", err);
      return '--/--/---- --:--';
    }
  };

  const glucoseRef = useRef<HTMLInputElement>(null);
  const bpmRef = useRef<HTMLInputElement>(null);
  const systolicRef = useRef<HTMLInputElement>(null);
  const diastolicRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Security requirement: Filter by userId
    const q = query(
      collection(db, 'readings'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as HealthReading));
      setReadings(data);
    }, (error) => {
      handleFirestoreError(error, 'list', 'readings');
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      // Set persistence to LOCAL so the user stays logged in even after closing the tab
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/popup-blocked') {
        alert("O login foi bloqueado pelo seu navegador. Por favor, permita pop-ups para este site e tente novamente.");
      } else if (err.code === 'auth/network-request-failed') {
        alert("Falha de conexão com a rede. Por favor, verifique sua internet ou tente novamente em alguns instantes.");
      } else if (err.code === 'auth/popup-closed-by-user') {
        // Just ignore if user closed it
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignore overlapping requests
      } else {
        alert("Ocorreu um erro ao tentar entrar. Por favor, verifique sua conexão ou tente novamente mais tarde.");
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogoClick = () => {
    // If already in delete mode, 1 click turns it off
    if (isDeleteMode) {
      setIsDeleteMode(false);
      setShowConfirmDelete(false);
      setLogoClicks(0);
      return;
    }
    
    // Clear existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    const newClicks = logoClicks + 1;
    
    // Set 2 second timeout to reset clicks if not finished
    clickTimeoutRef.current = setTimeout(() => {
      setLogoClicks(0);
    }, 2000);

    if (newClicks >= 5) {
      setIsDeleteMode(true);
      setLogoClicks(0);
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    } else {
      setLogoClicks(newClicks);
    }
  };

  const handleDeleteAll = async () => {
    if (!user) return;
    
    try {
      const q = query(collection(db, 'readings'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      setIsDeleteMode(false);
      setShowConfirmDelete(false);
    } catch (error) {
      handleFirestoreError(error, 'delete', 'readings');
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'readings', id));
    } catch (error) {
      handleFirestoreError(error, 'delete', 'readings');
    }
  };

  const handleSubmit = async (selectedPeriod: MealPeriod) => {
    if (!user) return;

    const { glucose, systolic, diastolic, bpm } = formData;
    if (!glucose || !systolic || !diastolic || !bpm) return;

    try {
      const docData = {
        glucose: Number(glucose),
        systolic: Number(systolic),
        diastolic: Number(diastolic),
        bpm: Number(bpm),
        period: selectedPeriod,
        userId: user.uid,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'readings'), docData);

      // Memory limit logic: limit to 50 readings
      // We only delete if we have more than 50 readings AND we have a proper order
      // To avoid deleting the new item (which might have a null timestamp during sync),
      // we only delete items that are definitely old.
      if (readings.length >= 50) {
        // Find documents with a valid createdAt to be safe
        const sortedWithDates = [...readings].filter(r => r.createdAt).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        if (sortedWithDates.length >= 50) {
          const oldestToDismiss = sortedWithDates.slice(49);
          for (const old of oldestToDismiss) {
            if (old.id) await deleteDoc(doc(db, 'readings', old.id));
          }
        }
      }
      
      // Reset form
      setFormData({ glucose: '', systolic: '', diastolic: '', bpm: '', period: '' });
      setHighlightPeriods(false);
      // Reset focus to Glucose
      setTimeout(() => glucoseRef.current?.focus(), 50);
    } catch (error) {
      handleFirestoreError(error, 'create', 'readings');
    }
  };

  const getStatus = (value: number, type: 'glucose' | 'systolic' | 'diastolic' | 'bpm'): HealthStatus => {
    switch (type) {
      case 'glucose':
        // Norma Brasileira (SBD): 70-99 Normal, 100-125 Pré-diabetes, >=126 Diabetes
        if (value >= 70 && value <= 99) return HealthStatus.GREAT;
        if (value >= 100 && value <= 125) return HealthStatus.ATTENTION;
        return HealthStatus.DANGER;
      case 'systolic':
        // Norma Brasileira (SBC): 91-120 Normal, 121-139 Pré-hipertensão, >=140 Hipertensão
        if (value > 90 && value <= 120) return HealthStatus.GREAT;
        if (value > 120 && value <= 139) return HealthStatus.ATTENTION;
        return HealthStatus.DANGER;
      case 'diastolic':
        // Norma Brasileira (SBC): 61-80 Normal, 81-89 Pré-hipertensão, >=90 Hipertensão
        if (value > 60 && value <= 80) return HealthStatus.GREAT;
        if (value > 80 && value <= 89) return HealthStatus.ATTENTION;
        return HealthStatus.DANGER;
      case 'bpm':
        // Normal 60-100, Risco < 50 ou > 100
        if (value >= 60 && value <= 100) return HealthStatus.GREAT;
        if (value >= 50 && value < 60) return HealthStatus.ATTENTION;
        return HealthStatus.DANGER;
      default:
        return HealthStatus.DANGER;
    }
  };

  const handleDownloadPDF = async () => {
    if (readings.length === 0) return;

    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(18);
      doc.setTextColor(34, 211, 238); // neon-blue color
      doc.text('VIVA + SAUDE', 105, 15, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Relatório de Saúde - ${user?.displayName || 'Usuário'}`, 105, 22, { align: 'center' });
      doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy    HH:mm")}`, 105, 29, { align: 'center' });

      // Table
      const tableData = readings.map(r => [
        formatDateBR(r.createdAt).replace(' ', '    '),
        r.period || '-',
        `${r.glucose} mg/dL`,
        `${r.systolic}/${r.diastolic} mmHg`,
        `${r.bpm} bpm`
      ]);

      autoTable(doc, {
        head: [['Data/Hora', 'Período', 'Glicose', 'Pressão (PA)', 'Pulsão (BPM)']],
        body: tableData,
        startY: 40,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] }, // slate-900
        alternateRowStyles: { fillColor: [241, 245, 249] },
      });

      doc.save(`viva-saude-relatorio-${format(new Date(), "dd-MM-yyyy")}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Erro ao gerar o PDF. Verifique se o navegador permitiu o download.");
    }
  };

  const getOverallStatus = (reading: HealthReading): HealthStatus => {
    const s1 = getStatus(reading.glucose, 'glucose');
    const s2 = getStatus(reading.systolic, 'systolic');
    const s3 = getStatus(reading.diastolic, 'diastolic');
    const s4 = getStatus(reading.bpm, 'bpm');
    
    if (s1 === HealthStatus.DANGER || s2 === HealthStatus.DANGER || s3 === HealthStatus.DANGER || s4 === HealthStatus.DANGER) return HealthStatus.DANGER;
    if (s1 === HealthStatus.ATTENTION || s2 === HealthStatus.ATTENTION || s3 === HealthStatus.ATTENTION || s4 === HealthStatus.ATTENTION) return HealthStatus.ATTENTION;
    return HealthStatus.GREAT;
  };

  const STATUS_UI = {
    [HealthStatus.GREAT]: { text: 'ÓTIMO', color: 'text-neon-green shadow-neon-green/20', bg: 'bg-neon-green/10 border-neon-green/20', dot: 'bg-neon-green shadow-[0_0_8px_rgba(52,211,153,0.5)]' },
    [HealthStatus.ATTENTION]: { text: 'ATENÇÃO', color: 'text-neon-yellow shadow-neon-yellow/20', bg: 'bg-neon-yellow/10 border-neon-yellow/20', dot: 'bg-neon-yellow shadow-[0_0_8px_rgba(251,191,36,0.5)]' },
    [HealthStatus.DANGER]: { text: 'PERIGO', color: 'text-neon-red shadow-neon-red/20', bg: 'bg-neon-red/10 border-neon-red/20', dot: 'bg-neon-red shadow-[0_0_8px_rgba(244,63,94,0.5)]' },
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      switch (field) {
        case 'glucose': bpmRef.current?.focus(); break;
        case 'bpm': systolicRef.current?.focus(); break;
        case 'systolic': diastolicRef.current?.focus(); break;
        case 'diastolic': 
          setHighlightPeriods(true);
          // Blur the input to show the highlight on buttons
          if (diastolicRef.current) diastolicRef.current.blur();
          break;
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-dark">
        <Activity className="w-12 h-12 text-neon-blue animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg-dark p-6">
        <div className="w-20 h-20 rounded-full bg-neon-blue/10 flex items-center justify-center mb-6 animate-float">
          <Activity className="w-10 h-10 text-neon-blue neon-glow-blue" />
        </div>
        <h1 className="text-4xl font-display font-bold text-white mb-2 neon-glow-blue">VIVA + <span className="text-neon-blue">SAUDE</span></h1>
        <p className="text-gray-400 mb-8 text-center max-w-xs">
          Monitore sua saúde com precisão e estilo.
        </p>
        <button 
          onClick={handleLogin}
          className="w-full max-w-xs flex items-center justify-center gap-3 bg-white text-black py-3 px-6 rounded-xl font-semibold hover:bg-gray-200 transition-all active:scale-95"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          Entrar com Google
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-dark text-slate-200 font-sans">
      {/* Header */}
      <header className="p-6 flex items-center bg-bg-dark/80 backdrop-blur-md z-10 flex-shrink-0">
        <button 
          onClick={handleLogoClick}
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-500 relative flex-shrink-0 active:scale-95",
            isDeleteMode 
              ? "bg-red-500 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)]" 
              : "bg-slate-900 border-slate-800 shadow-lg"
          )}
        >
          <motion.div
            key={logoClicks}
            animate={isDeleteMode ? { 
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0]
            } : { 
              scale: [1, 1.15, 1] 
            }}
            transition={{ 
              duration: isDeleteMode ? 0.4 : (logoClicks > 0 ? 0.2 : 0.8), 
              repeat: isDeleteMode || logoClicks === 0 ? Infinity : 0,
              ease: "easeInOut"
            }}
            className="flex items-center justify-center relative"
          >
            <Heart className={cn(
              "w-8 h-8 transition-colors",
              isDeleteMode ? "text-white fill-white" : "text-neon-red fill-neon-red/20"
            )} />
            <Activity className={cn(
              "w-5 h-5 absolute transition-colors",
              isDeleteMode ? "text-red-200" : "text-neon-blue"
            )} />
          </motion.div>
          
          {logoClicks > 0 && !isDeleteMode && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-neon-blue rounded-full text-[8px] font-black flex items-center justify-center text-black border border-bg-dark">
              {logoClicks}
            </div>
          )}
        </button>

        <div className="flex-1 text-center px-2">
          <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tighter text-white uppercase leading-none">
            VIVA + <span className="text-neon-blue">SAUDE</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0">
          <button 
            onClick={() => setIsHowItWorksOpen(true)}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          <div className="relative group">
            {user.photoURL ? (
              <div className="w-10 h-10 rounded-full border-2 border-neon-blue/40 p-0.5 overflow-hidden">
                <img src={user.photoURL} alt="Avatar" className="w-full h-full rounded-full bg-slate-800" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center border-2 border-slate-700">
                <UserIcon className="w-5 h-5 text-slate-400" />
              </div>
            )}
            <button 
              onClick={handleLogout}
              className="absolute -bottom-1 -right-1 w-5 h-5 bg-neon-red rounded-full flex items-center justify-center shadow-lg shadow-neon-red/40 active:scale-90"
            >
              <LogOut className="w-3 h-3 text-white" />
            </button>
          </div>
        </div>
      </header>

      <main className="px-6 max-w-md mx-auto flex flex-col flex-1 min-h-0 overflow-hidden pb-4">
        {/* Bento Input Grid: GLI -> BPM -> SIS -> DIA */}
        <section className="space-y-3 flex-shrink-0 pt-2 shadow-2xl pb-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Glicose Card */}
            <div className={cn(
              "p-4 rounded-2xl relative border transition-all duration-300",
              formData.glucose 
                ? STATUS_UI[getStatus(Number(formData.glucose), 'glucose')].bg
                : "bg-slate-900/50 border-slate-800"
            )}>
              <p className="text-[10px] text-slate-200 uppercase font-bold mb-1">GLICOSE</p>
              <div className="flex items-end gap-1">
                <input 
                  ref={glucoseRef}
                  type="number"
                  placeholder="0"
                  value={formData.glucose}
                  onChange={(e) => setFormData({...formData, glucose: e.target.value})}
                  onKeyDown={(e) => handleKeyDown(e, 'glucose')}
                  className={cn(
                    "bg-transparent text-2xl font-bold w-full focus:outline-none transition-colors",
                    formData.glucose 
                      ? STATUS_UI[getStatus(Number(formData.glucose), 'glucose')].color
                      : "text-slate-600 placeholder:text-slate-800"
                  )}
                />
                <span className="text-[10px] text-slate-500 pb-1">mg/dL</span>
              </div>
              {formData.glucose && (
                <p className={cn("text-[9px] mt-1 uppercase font-bold text-left", STATUS_UI[getStatus(Number(formData.glucose), 'glucose')].color)}>
                  {STATUS_UI[getStatus(Number(formData.glucose), 'glucose')].text}
                </p>
              )}
            </div>

            {/* BPM Card */}
            <div className={cn(
              "p-4 rounded-2xl border transition-all duration-300",
              formData.bpm 
                ? STATUS_UI[getStatus(Number(formData.bpm), 'bpm')].bg
                : "bg-slate-900/50 border-slate-800"
            )}>
              <p className="text-[10px] text-slate-200 uppercase font-bold mb-1">BATIMENTOS</p>
              <div className="flex items-end gap-1">
                <input 
                  ref={bpmRef}
                  type="number"
                  placeholder="0"
                  value={formData.bpm}
                  onChange={(e) => setFormData({...formData, bpm: e.target.value})}
                  onKeyDown={(e) => handleKeyDown(e, 'bpm')}
                  className={cn(
                    "bg-transparent text-2xl font-bold w-full focus:outline-none transition-colors",
                    formData.bpm 
                      ? STATUS_UI[getStatus(Number(formData.bpm), 'bpm')].color
                      : "text-slate-600 placeholder:text-slate-800"
                  )}
                />
                <span className="text-[10px] text-slate-500 pb-1">BPM</span>
              </div>
              {formData.bpm && (
                <p className={cn("text-[9px] mt-1 uppercase font-bold text-left", STATUS_UI[getStatus(Number(formData.bpm), 'bpm')].color)}>
                  {STATUS_UI[getStatus(Number(formData.bpm), 'bpm')].text}
                </p>
              )}
            </div>

            {/* SIS Card */}
            <div className={cn(
              "p-4 rounded-2xl border transition-all duration-300",
              formData.systolic 
                ? STATUS_UI[getStatus(Number(formData.systolic), 'systolic')].bg
                : "bg-slate-900/50 border-slate-800"
            )}>
              <p className="text-[10px] text-slate-200 uppercase font-bold mb-1">PRESSÃO (SIS)</p>
              <div className="flex items-end gap-1">
                <input 
                  ref={systolicRef}
                  type="number"
                  placeholder="0"
                  value={formData.systolic}
                  onChange={(e) => setFormData({...formData, systolic: e.target.value})}
                  onKeyDown={(e) => handleKeyDown(e, 'systolic')}
                  className={cn(
                    "bg-transparent text-2xl font-bold w-full focus:outline-none transition-colors",
                    formData.systolic 
                      ? STATUS_UI[getStatus(Number(formData.systolic), 'systolic')].color
                      : "text-slate-600 placeholder:text-slate-800"
                  )}
                />
                <span className="text-[10px] text-slate-500 pb-1">mmHg</span>
              </div>
              {formData.systolic && (
                <p className={cn("text-[9px] mt-1 uppercase font-bold text-left", STATUS_UI[getStatus(Number(formData.systolic), 'systolic')].color)}>
                  {STATUS_UI[getStatus(Number(formData.systolic), 'systolic')].text}
                </p>
              )}
            </div>

            {/* DIA Card */}
            <div className={cn(
              "p-4 rounded-2xl border transition-all duration-300",
              formData.diastolic 
                ? STATUS_UI[getStatus(Number(formData.diastolic), 'diastolic')].bg
                : "bg-slate-900/50 border-slate-800"
            )}>
              <p className="text-[10px] text-slate-200 uppercase font-bold mb-1">PRESSÃO (DIA)</p>
              <div className="flex items-end gap-1">
                <input 
                  ref={diastolicRef}
                  type="number"
                  placeholder="0"
                  value={formData.diastolic}
                  onChange={(e) => setFormData({...formData, diastolic: e.target.value})}
                  onKeyDown={(e) => handleKeyDown(e, 'diastolic')}
                  className={cn(
                    "bg-transparent text-2xl font-bold w-full focus:outline-none transition-colors",
                    formData.diastolic 
                      ? STATUS_UI[getStatus(Number(formData.diastolic), 'diastolic')].color
                      : "text-slate-600 placeholder:text-slate-800"
                  )}
                />
                <span className="text-[10px] text-slate-500 pb-1">mmHg</span>
              </div>
              {formData.diastolic && (
                <p className={cn("text-[9px] mt-1 uppercase font-bold text-left", STATUS_UI[getStatus(Number(formData.diastolic), 'diastolic')].color)}>
                  {STATUS_UI[getStatus(Number(formData.diastolic), 'diastolic')].text}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-4">
            {(['JEJUM', 'APOS CAFÉ', 'APOS ALMOÇO', 'APOS JANTAR'] as MealPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => handleSubmit(p)}
                disabled={!formData.glucose || !formData.bpm || !formData.systolic || !formData.diastolic}
                className={cn(
                  "py-2.5 rounded-xl border text-[9px] font-bold transition-all disabled:opacity-20 disabled:active:scale-100 uppercase tracking-tight active:scale-95",
                  highlightPeriods 
                    ? "border-neon-blue bg-neon-blue/20 text-white animate-pulse" 
                    : "border-slate-700 bg-slate-900/60 text-slate-200 hover:text-white hover:border-neon-blue/40"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          
          <div className="h-px w-full bg-slate-800/50 mt-4"></div>
        </section>

        {/* History Section */}
        <section className="flex-1 flex flex-col min-h-0 space-y-4 pt-4 pb-4">
          <div className="flex justify-between items-center px-1 flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Histórico Recente</h2>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded-full">
                {readings.length} / 50
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {isDeleteMode && (
                <div className="flex items-center gap-2">
                  {showConfirmDelete ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                       <button 
                        onClick={handleDeleteAll}
                        className="py-1 px-3 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all shadow-lg shadow-red-600/20"
                      >
                        CONFIRMAR
                      </button>
                      <button 
                        onClick={() => setShowConfirmDelete(false)}
                        className="p-1 px-3 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-bold uppercase active:scale-95"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setShowConfirmDelete(true)}
                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors active:scale-95 flex items-center gap-2 px-2.5 text-[9px] font-black uppercase tracking-widest shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      LIMPAR HISTÓRICO
                    </button>
                  )}
                </div>
              )}
              <button 
                onClick={handleDownloadPDF}
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-neon-blue hover:bg-slate-800 transition-colors active:scale-95"
                title="Baixar Relatório PDF"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            <AnimatePresence mode="popLayout">
              {readings.map((reading) => (
                <motion.div
                  key={reading.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-slate-900/30 border border-slate-800/50 p-4 rounded-xl flex items-center justify-between shadow-sm"
                >
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span className="text-[10px] font-mono text-slate-300 font-medium">
                              {formatDateBR(reading.createdAt)}
                            </span>
                            {reading.period && (
                              <span className="text-[10px] font-black text-neon-blue uppercase tracking-wider ml-1">
                                • {reading.period}
                              </span>
                            )}
                          </div>
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            STATUS_UI[getOverallStatus(reading)].dot
                          )} />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <p className="text-xs font-bold text-white uppercase tracking-tight">
                              GLI: <span className={cn("font-black", STATUS_UI[getStatus(reading.glucose, 'glucose')].color)}>{reading.glucose}</span>
                            </p>
                            <p className="text-xs font-bold text-white uppercase tracking-tight">
                              PA: <span className={cn("font-black", STATUS_UI[getStatus(reading.systolic, 'systolic')].color)}>{reading.systolic}</span>/<span className={cn("font-black", STATUS_UI[getStatus(reading.diastolic, 'diastolic')].color)}>{reading.diastolic}</span>
                            </p>
                            <p className="text-xs font-bold text-white uppercase tracking-tight">
                              BPM: <span className={cn("font-black", STATUS_UI[getStatus(reading.bpm, 'bpm')].color)}>{reading.bpm}</span>
                            </p>
                          </div>
                          {isDeleteMode && (
                            <button 
                              onClick={() => reading.id && handleDeleteItem(reading.id)}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors active:scale-90"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
              ))}
            </AnimatePresence>

            {readings.length === 0 && (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
                <p className="text-slate-600 text-xs">Nenhum registro ainda disponível.</p>
              </div>
            )}
          </div>
        </section>
      </main>
 
      {/* How It Works Modal */}
      <AnimatePresence>
        {isHowItWorksOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-bg-dark/95 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-neon-blue/10 flex items-center justify-center border border-neon-blue/20">
                    <Info className="w-5 h-5 text-neon-blue" />
                  </div>
                  <h3 className="font-bold text-white uppercase tracking-tight">COMO FUNCIONA</h3>
                </div>
                <button 
                  onClick={() => setIsHowItWorksOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-800 text-slate-400 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-neon-blue/20 flex-shrink-0 flex items-center justify-center text-neon-blue text-xs font-black">1</div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase mb-1">Registro de Dados</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">Insira os valores de Glicose, BPM e Pressão (SIS e DIA). Pressione <span className="text-white font-bold">ENTER</span> para pular para o próximo campo rapidamente.</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-neon-yellow/20 flex-shrink-0 flex items-center justify-center text-neon-yellow text-xs font-black">2</div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase mb-1">Selecione o Período</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">Após preencher todos os dados, escolha o momento da medição (Ex: Jejum ou Após Almoço) para salvar.</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-neon-green/20 flex-shrink-0 flex items-center justify-center text-neon-green text-xs font-black">3</div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase mb-1">Status Inteligente</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">O app classifica seus resultados automaticamente seguindo normas brasileiras de saúde para sua segurança.</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-neon-red/20 flex-shrink-0 flex items-center justify-center text-neon-red text-xs font-black">4</div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase mb-1">Modo Edição (Segredo)</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">Para apagar registros ou limpar o histórico, clique no <span className="text-neon-red font-bold">CORAÇÃO</span> do topo por 5 vezes seguidas e 1 vez para desativar.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-neon-green" />
                    <span className="text-[10px] font-bold text-white uppercase">Dicas Rápidas</span>
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-[10px] text-slate-500">
                      <div className="w-1 h-1 rounded-full bg-slate-700 mt-1.5 flex-shrink-0" />
                      O histórico mostra seus últimos 50 registros.
                    </li>
                    <li className="flex items-start gap-2 text-[10px] text-slate-500">
                      <div className="w-1 h-1 rounded-full bg-slate-700 mt-1.5 flex-shrink-0" />
                      Gere um PDF para levar na sua consulta médica.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-6 bg-slate-900 border-t border-slate-800">
                <button 
                  onClick={() => setIsHowItWorksOpen(false)}
                  className="w-full py-4 bg-neon-blue text-black font-black uppercase tracking-widest text-xs rounded-2xl active:scale-95 transition-all shadow-lg shadow-neon-blue/20"
                >
                  ENTENDI! VAMOS COMEÇAR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
