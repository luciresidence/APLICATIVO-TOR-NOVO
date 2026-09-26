import React, { useState, useEffect, useRef } from 'react';
import { fetchLatestVehicleKm, fetchPersonnelAbsences, fetchPersonnel, fetchSpreadsheetVehicles, fetchSpreadsheetTeams } from '../services/sheetsService';
import LeavesPanel from '../components/LeavesPanel';
import { PersonnelAbsence as Leave } from '../types';

interface Member {
  name: string;
  role: string;
  icon: string;
}

interface Team {
  id: string;
  name: string;
  sector: string;
  status: string;
  color: string;
  members: Member[];
}

interface Vehicle {
  id: string;
  prefix: string;
  status: 'OPERANDO' | 'BAIXADA';
  model: string;
  year: string;
  plate: string;
  odometer: number;
  oilInterval: number;
  lastOilChangeOdometer: number;
  color: string;
}

const initialTeams: Team[] = [
  {
    id: '1',
    name: 'EQUIPE ALFA',
    sector: 'Eixo Norte / Rod. Anhanguera',
    status: 'Patrulhamento',
    color: 'tor-blue',
    members: [
      { name: 'Sgt. Silva', role: 'GESTOR', icon: 'person' },
      { name: 'Cb. Oliveira', role: 'MOTORISTA', icon: 'navigation' },
      { name: 'Sd. Pereira', role: 'AUXILIAR 1', icon: 'shield' },
      { name: 'Sd. Lima', role: 'AUXILIAR 2', icon: 'shield' },
    ]
  },
  {
    id: '2',
    name: 'EQUIPE BRAVO',
    sector: 'Região Central / Rod. Castelo',
    status: 'Ocorrência',
    color: 'tor-blue',
    members: [
      { name: 'Sgt. Santos', role: 'GESTOR', icon: 'person' },
      { name: 'Sd. Costa', role: 'MOTORISTA', icon: 'navigation' },
      { name: 'Cb. Mendes', role: '3º HOMEM', icon: 'shield' },
      { name: 'Sd. Rocha', role: '4º HOMEM', icon: 'shield' },
    ]
  }
];

const initialVehicles: Vehicle[] = [
  {
    id: 'TOR-01',
    prefix: '4582',
    status: 'OPERANDO',
    model: 'Toyota SW4',
    year: '2024',
    plate: 'ABC-1234',
    odometer: 12450,
    oilInterval: 10000,
    lastOilChangeOdometer: 10000,
    color: 'tor-blue'
  },
  {
    id: 'TOR-02',
    prefix: '7337',
    status: 'OPERANDO',
    model: 'Toyota SW4',
    year: '2022',
    plate: 'XYZ-5678',
    odometer: 45892,
    oilInterval: 10000,
    lastOilChangeOdometer: 40000,
    color: 'tor-blue'
  }
];

const getRankIcon = (nameOrGraduation: string) => {
  const normalized = nameOrGraduation.toUpperCase();
  const v = '?v=300';
  if (normalized.includes('SUB TEN') || normalized.includes('SUBTEN') || normalized.includes('SUB') || normalized.includes('TENENTE') || normalized.includes('TEN')) return `/ranks/subten.png${v}`;
  if (normalized.includes('1º SGT') || normalized.includes('1SGT') || normalized.includes('1ºSGT') || normalized.includes('1 SGT')) return `/ranks/1sgt.png${v}`;
  if (normalized.includes('2º SGT') || normalized.includes('2SGT') || normalized.includes('2ºSGT') || normalized.includes('2 SGT')) return `/ranks/2sgt.png${v}`;
  if (normalized.includes('3º SGT') || normalized.includes('3SGT') || normalized.includes('3ºSGT') || normalized.includes('3 SGT') || normalized.includes('SGT')) return `/ranks/3sgt.png${v}`;
  if (normalized.includes('CABO') || normalized.includes('CB')) return `/ranks/cabo.png${v}`;
  if (normalized.includes('SOLDADO') || normalized.includes('SD')) return `/ranks/soldado.png${v}`;
  return null;
};

const OperationalView: React.FC<{ isLoggedIn: boolean }> = ({ isLoggedIn }) => {
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personnelList, setPersonnelList] = useState<any[]>([]);
  const [activeLeaves, setActiveLeaves] = useState<Leave[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Ref para sincronização automática segura
  const vehiclesRef = useRef<Vehicle[]>([]);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  const parseDateString = (dateStr: string) => {
    if (!dateStr) return new Date();
    const trimmed = dateStr.trim();
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00`);
      }
    }
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 2 && parts[2].length === 4) {
          const [day, month, year] = parts;
          return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00`);
        }
        return new Date(trimmed + 'T12:00:00');
      }
    }
    return new Date(trimmed);
  };

  const fetchData = async () => {
    setLoading(true);

    // Fetch Efetivo e Afastamentos via Google Sheets
    const pData = await fetchPersonnel();
    const aData = await fetchPersonnelAbsences();

    setPersonnelList(pData);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeAData = aData.filter(a => {
      if (!a.start_date || !a.end_date) return false;
      const start = parseDateString(a.start_date);
      const end = parseDateString(a.end_date);
      return today >= start && today <= end;
    }).map(a => {
      const person = pData.find(p => p.id === a.personnel_id);
      return {
        ...a,
        personnel: person ? { name: person.name, graduation: person.graduation } : null
      } as Leave;
    });
    
    setActiveLeaves(activeAData);

    // Load Google Sheets Vehicles
    let mappedVehicles = await fetchSpreadsheetVehicles();
    if (mappedVehicles.length === 0) {
      mappedVehicles = initialVehicles;
    }

    const updatedVehicles = await Promise.all(mappedVehicles.map(async (v) => {
      try {
        const latestKm = await fetchLatestVehicleKm(v.id);
        if (latestKm !== null && latestKm !== v.odometer) {
          const nv = { ...v, odometer: latestKm };
          return nv;
        }
      } catch (error) {
        console.error('Erro na sincronização automática:', error);
      }
      return v;
    }));

    const sortedVehicles = updatedVehicles.sort((a, b) => {
      if (a.id === 'TOR 0003') return -1;
      if (b.id === 'TOR 0003') return 1;
      if (a.id === 'TOR 0004') return -1;
      if (b.id === 'TOR 0004') return 1;
      return a.id.localeCompare(b.id);
    });

    setVehicles(sortedVehicles);

    // Load Google Sheets Teams
    let fetchedTeams = await fetchSpreadsheetTeams();
    if (fetchedTeams.length === 0) {
      fetchedTeams = initialTeams;
    }
    setTeams(fetchedTeams);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Polling Automático de KM (a cada 60s)
    const interval = setInterval(() => {
      syncVehicleKm();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const getMemberStatusIcon = (memberName: string) => {
    const leave = activeLeaves.find(l => {
      return memberName.includes(l.personnel?.name || '@@@');
    });

    if (leave) {
      const typeNorm = leave.type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      if (typeNorm.includes('FERIAS')) return { icon: 'beach_access', color: 'text-orange-500', bg: 'bg-orange-50' };
      if (typeNorm.includes('LICENCA') || typeNorm.includes('ATESTADO')) return { icon: 'assignment', color: 'text-purple-500', bg: 'bg-purple-50' };
    }

    return { icon: 'local_police', color: 'text-emerald-500', bg: 'bg-emerald-50' };
  };

  const syncVehicleKm = async () => {
    if (vehiclesRef.current.length === 0) return;
    
    setIsSyncing(true);
    let changed = false;
    const updatedVehicles = await Promise.all(vehiclesRef.current.map(async (v) => {
      const latestKm = await fetchLatestVehicleKm(v.id);
      if (latestKm !== null && latestKm !== v.odometer) {
        changed = true;
        return { ...v, odometer: latestKm };
      }
      return v;
    }));
    
    if (changed) {
      setVehicles(updatedVehicles);
    }
    setIsSyncing(false);
  };

  const calculateOilLife = (v: Vehicle) => {
    const baseInterval = v.oilInterval || 10000;
    const nextChange = v.lastOilChangeOdometer + baseInterval;
    const remainingKm = nextChange - v.odometer;
    const life = (remainingKm / baseInterval) * 100;
    return Math.max(0, Math.min(100, Math.round(life)));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="size-16 border-4 border-tor-blue border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-900 font-black uppercase tracking-widest text-sm">Carregando dados operacionais e afastamentos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <style>{`
        @keyframes flash-red {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
        .animate-flash-red {
          animation: flash-red 0.8s ease-in-out infinite;
        }
      `}</style>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {teams.map((team) => (
          <div key={team.id} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
            <div className={`absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -translate-y-12 translate-x-12 opacity-50`}></div>

            <div className="flex justify-between items-start mb-8 relative z-10">
              <div className="flex gap-5 flex-1">
                <div className={`size-16 rounded-[22px] bg-blue-50 flex items-center justify-center text-tor-blue shadow-inner`}>
                  <span className="material-symbols-outlined text-4xl filled-icon">shield</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl md:text-[28px] font-black text-slate-900 leading-tight mb-1 truncate">{team.name}</h3>

                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-lg mt-0.5">explore</span>
                    <div className="text-xs font-bold leading-relaxed flex-1 whitespace-normal break-words">
                      <span className="text-slate-400 uppercase tracking-tighter mr-1 shrink-0">Setor: </span>
                      <span className="text-tor-blue">{team.sector}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 relative z-10">
              <p className="text-[12px] md:text-[14px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-3 text-center">
                GUARNIÇÃO
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {team.members.filter(m => m.name.trim() !== '').map((member, idx) => {
                  const statusInfo = getMemberStatusIcon(member.name);

                  return (
                    <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm transition-all group/member relative">
                      <div className={`absolute -top-2 -right-2 p-1.5 rounded-full ${statusInfo.bg} ${statusInfo.color} shadow-sm z-20`}>
                        <span className="material-symbols-outlined text-sm">{statusInfo.icon}</span>
                      </div>

                      <div className="size-9 md:size-11 rounded-full bg-white flex items-center justify-center text-slate-300 border border-slate-100 shadow-sm group-hover/member:text-slate-500 overflow-hidden transition-colors shrink-0">
                        {getRankIcon(member.name) ? (
                          <img src={getRankIcon(member.name)!} className="w-full h-full object-contain p-1" alt="rank" />
                        ) : (
                          <span className="material-symbols-outlined text-lg md:text-xl">{member.icon}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800">{member.name}</p>
                        <p className={`text-[9px] font-black text-tor-blue uppercase tracking-tight`}>
                          {member.role}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <LeavesPanel isLoggedIn={isLoggedIn} />

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="size-10 rounded-xl bg-tor-blue/10 text-tor-blue flex items-center justify-center">
              <span className={`material-symbols-outlined text-2xl ${isSyncing ? 'animate-spin' : ''}`}>
                {isSyncing ? 'sync' : 'commute'}
              </span>
            </div>
            <div className="flex flex-col">
              <h3 className="text-slate-900 text-lg font-bold uppercase tracking-wider leading-tight">Status das Viaturas</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                {isSyncing ? 'Sincronizando Automaticamente...' : 'Monitoramento Automático Ativo (60s)'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
          {vehicles.map((vehicle, index) => {
            const oilLife = calculateOilLife(vehicle);
            const nextChange = vehicle.lastOilChangeOdometer + vehicle.oilInterval;
            const isUrgent = vehicle.odometer >= nextChange;

            return (
              <div key={vehicle.id} className={`space-y-8 ${index % 2 !== 0 ? 'lg:border-l lg:border-slate-50 lg:pl-12' : ''}`}>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-4">
                      <div className={`px-4 py-1.5 rounded-xl text-white font-black text-xs md:text-sm shadow-lg bg-tor-blue shadow-tor-blue/20 shrink-0`}>
                        {vehicle.id}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md whitespace-nowrap border border-slate-100">{vehicle.plate}</span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col min-w-0 gap-1">
                      <h4 className="text-slate-900 font-black text-sm md:text-lg leading-tight break-words">
                        {vehicle.model}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300 font-bold text-[10px] md:text-sm shrink-0">{vehicle.year}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] md:text-[9px] font-black shrink-0 ${vehicle.status === 'OPERANDO' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {vehicle.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Odômetro Atual', value: vehicle.odometer },
                    { label: 'Próx. Troca Óleo', value: vehicle.lastOilChangeOdometer + vehicle.oilInterval },
                  ].map(item => (
                    <div key={item.label} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">{item.label}</p>
                      <p className="text-sm font-black text-slate-800">{item.value.toLocaleString('pt-BR')} km</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-end px-1">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Vida Útil do Óleo</p>
                    <p className={`text-xs font-black ${oilLife < 20 ? 'text-red-500' : 'text-tor-blue'}`}>
                      {oilLife}%
                    </p>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div
                      className={`h-full transition-all duration-1000 rounded-full ${oilLife < 20 ? 'bg-red-500' : 'bg-gradient-to-r from-tor-blue to-sky-400'}`}
                      style={{ width: `${oilLife}%` }}
                    ></div>
                  </div>

                  {isUrgent ? (
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <p className="text-[11px] font-black text-red-600 uppercase tracking-widest animate-flash-red">
                        ⚠️ TROCAR DE ÓLEO URGENTE ⚠️
                      </p>
                      <p className="text-[8px] text-red-500 font-bold uppercase tracking-tighter">
                        Vencido por {(vehicle.odometer - (vehicle.lastOilChangeOdometer + vehicle.oilInterval)).toLocaleString('pt-BR')} km
                      </p>
                    </div>
                  ) : (
                    <p className="text-[8px] text-slate-400 font-bold uppercase text-center tracking-tighter">
                      {Math.max(0, (vehicle.lastOilChangeOdometer + vehicle.oilInterval) - vehicle.odometer).toLocaleString('pt-BR')} km restantes para troca
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OperationalView;
