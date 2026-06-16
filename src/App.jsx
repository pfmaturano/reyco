import { useState, useEffect, useCallback, useRef } from "react";
import { dbGetCloud, dbSetCloud, dbSubscribe } from "./firebase.js";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const KEYS = {
  users:"reyco_users", cases:"reyco_cases", notaria:"reyco_notaria",
  settings:"reyco_settings", testimoniales:"reyco_testimoniales",
  clientes:"reyco_clientes", agenda:"reyco_agenda",
};
// Caché local instantáneo (para que la app cargue rápido sin esperar la red)
function dbGet(k){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch{ return null; } }
function dbSetLocal(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} }
// Escritura real: guarda en caché local Y en la nube (Firestore)
function dbSet(k,v){ dbSetLocal(k,v); dbSetCloud(k,v); }

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────
const DEFAULT_USERS=[
  {id:"su1",name:"Lic. Antonio Corripio",username:"admin",password:"reyco2024",role:"superuser"},
  {id:"ab1",name:"Abogado 1",username:"abogado1",password:"abogado1",role:"abogado"},
  {id:"no1",name:"Notaría REYCO",username:"notaria",password:"notaria2024",role:"notaria"},
];
const DEFAULT_CFG={amarillo:28,rojo:14};
const MATERIAS=["Penal","Laboral","Familiar","Civil","Mercantil","Otro"];
const DOC_CHECKLIST={
  Penal:["Denuncia / Querella","Carpeta de investigación","Auto de vinculación","Pruebas ofrecidas","Amparo (si aplica)"],
  Laboral:["Demanda laboral","Contrato de trabajo","Recibos de nómina","Acta de emplazamiento","Pruebas documentales"],
  Familiar:["Acta de matrimonio / nacimiento","Demanda inicial","Convenio (si aplica)","Pruebas periciales","Resolución judicial"],
  Civil:["Demanda","Documentos base de la acción","Contestación","Pruebas","Sentencia"],
  Mercantil:["Contrato mercantil","Demanda","Documentos societarios","Pruebas","Sentencia"],
  Otro:["Escrito inicial","Documentos de soporte","Pruebas","Resolución"],
};
const TIPO_NOTARIA=["Escritura pública","Poder notarial","Testamento","Acta notarial","Contrato","Convenio","Fe de hechos","Otro"];
const TIPO_DILIGENCIA=["Audiencia","Presentación de escrito","Notificación","Junta","Vencimiento de plazo","Diligencia","Otro"];

// ─── UTILS ────────────────────────────────────────────────────────────────────
function semaforo(f,ok,cfg){
  if(!f)return"gray";
  const d=Math.ceil((new Date(f)-new Date())/86400000);
  if(!ok)return d<=cfg.rojo?"red":"orange";
  if(d<=cfg.rojo)return"red";
  if(d<=cfg.amarillo)return"yellow";
  return"green";
}
const SC={green:"#16a34a",yellow:"#ca8a04",orange:"#ea580c",red:"#dc2626",gray:"#6b7280"};
const SL={green:"Al día",yellow:"Próximo",orange:"Docs faltantes",red:"URGENTE",gray:"Sin fecha"};
const SEM_BG={green:"#16a34a18",yellow:"#ca8a0418",orange:"#ea580c18",red:"#dc262618",gray:"#6b728018"};
const SEM_BD={green:"#16a34a55",yellow:"#ca8a0455",orange:"#ea580c55",red:"#dc262655",gray:"#6b728055"};
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
function fmtDate(d){if(!d)return"—";return new Date(d).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"});}
function fmtMoney(n){return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(n||0);}
function diasRestantes(d){if(!d)return null;return Math.ceil((new Date(d)-new Date())/86400000);}
function diasEnProceso(d){if(!d)return null;return Math.floor((new Date()-new Date(d))/86400000);}
function colorProceso(d){if(d===null)return"gray";if(d>180)return"red";if(d>90)return"orange";if(d>30)return"yellow";return"green";}
const PROC_LABEL={green:"Reciente",yellow:"En curso",orange:"Prolongado",red:"Muy prolongado",gray:"—"};
function genToken(c){return btoa(unescape(encodeURIComponent(JSON.stringify({id:c.id,exp:c.expediente,nombre:c.demandante,materia:c.materia,ts:Date.now()}))));}
function decodeToken(t){try{return JSON.parse(decodeURIComponent(escape(atob(t))));}catch{return null;}}
function encuestaURL(c){return`${window.location.href.split("?")[0]}?encuesta=${genToken(c)}`;}
function waMsg(tel,txt){const p=(tel||"").replace(/\D/g,"");return`https://wa.me/${p||"522226506458"}?text=${encodeURIComponent(txt)}`;}
function mailMsg(email,sub,body){return`mailto:${email||""}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S={
  app:{fontFamily:"'Inter',sans-serif",background:"#0f172a",minHeight:"100vh",color:"#f1f5f9"},
  loginWrap:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0f1e"},
  loginBox:{background:"#111827",border:"1px solid #B8960C44",padding:"48px 40px",width:380,textAlign:"center"},
  loginLogo:{fontFamily:"Georgia,serif",fontSize:32,fontWeight:700,color:"#B8960C",letterSpacing:6,marginBottom:4},
  loginSub:{fontSize:11,letterSpacing:3,color:"#6b7280",textTransform:"uppercase",marginBottom:36},
  loginLabel:{display:"block",fontSize:10,letterSpacing:3,color:"#B8960C",textTransform:"uppercase",marginBottom:8,textAlign:"left"},
  loginInput:{width:"100%",background:"#0f172a",border:"1px solid #B8960C33",color:"#f1f5f9",padding:"11px 14px",fontSize:14,outline:"none",marginBottom:16,fontFamily:"inherit",boxSizing:"border-box"},
  loginBtn:{width:"100%",background:"#B8960C",color:"#0a0f1e",border:"none",padding:14,fontSize:12,fontWeight:700,letterSpacing:3,textTransform:"uppercase",cursor:"pointer"},
  loginErr:{color:"#f87171",fontSize:13,marginTop:8},
  sidebar:{width:220,background:"#111827",borderRight:"1px solid #B8960C22",display:"flex",flexDirection:"column",minHeight:"100vh",position:"fixed",top:0,left:0,zIndex:50},
  sidebarLogo:{padding:"24px 20px 14px",borderBottom:"1px solid #B8960C22"},
  sidebarLogoText:{fontFamily:"Georgia,serif",fontSize:20,fontWeight:700,color:"#B8960C",letterSpacing:4},
  sidebarLogoSub:{fontSize:9,color:"#6b7280",letterSpacing:2,textTransform:"uppercase",marginTop:3},
  sidebarUser:{padding:"10px 20px",borderBottom:"1px solid #B8960C22"},
  sidebarNav:{flex:1,padding:"10px 0",overflowY:"auto"},
  navItem:(a)=>({display:"flex",alignItems:"center",gap:10,padding:"9px 20px",fontSize:12,color:a?"#B8960C":"#9ca3af",background:a?"#B8960C11":"transparent",borderLeft:a?"2px solid #B8960C":"2px solid transparent",cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}),
  navSection:{padding:"12px 20px 4px",fontSize:9,letterSpacing:3,color:"#374151",textTransform:"uppercase"},
  sidebarFooter:{padding:"14px 20px",borderTop:"1px solid #B8960C22"},
  main:{marginLeft:220,padding:"28px 32px",minHeight:"100vh"},
  pageHeader:{marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"flex-start"},
  pageTitle:{fontFamily:"Georgia,serif",fontSize:24,fontWeight:700,color:"#f1f5f9"},
  pageSubtitle:{fontSize:13,color:"#6b7280",marginTop:4},
  statGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24},
  statCard:(c)=>({background:"#111827",border:`1px solid ${c}44`,borderTop:`2px solid ${c}`,padding:"18px 18px 14px"}),
  statNum:{fontSize:32,fontWeight:700,lineHeight:1},
  statLabel:{fontSize:10,color:"#6b7280",letterSpacing:2,textTransform:"uppercase",marginTop:5},
  tableWrap:{background:"#111827",border:"1px solid #B8960C22",overflow:"hidden"},
  table:{width:"100%",borderCollapse:"collapse"},
  th:{padding:"9px 14px",textAlign:"left",fontSize:10,letterSpacing:2,color:"#6b7280",textTransform:"uppercase",borderBottom:"1px solid #B8960C1A",background:"#0f172a"},
  td:{padding:"11px 14px",fontSize:13,borderBottom:"1px solid #B8960C11",color:"#d1d5db",verticalAlign:"middle"},
  semDot:(c)=>({display:"inline-block",width:9,height:9,borderRadius:"50%",background:c,marginRight:5,flexShrink:0}),
  btn:{padding:"8px 16px",fontSize:11,fontWeight:600,letterSpacing:1,cursor:"pointer",border:"none",textTransform:"uppercase",fontFamily:"inherit"},
  btnPrimary:{background:"#B8960C",color:"#0a0f1e"},
  btnGhost:{background:"transparent",color:"#B8960C",border:"1px solid #B8960C44"},
  btnDanger:{background:"#dc262622",color:"#f87171",border:"1px solid #dc262644"},
  btnGreen:{background:"#16a34a22",color:"#86efac",border:"1px solid #16a34a44"},
  btnBlue:{background:"#2563eb22",color:"#93c5fd",border:"1px solid #2563eb44"},
  overlay:{position:"fixed",inset:0,background:"#000000bb",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"},
  modal:{background:"#111827",border:"1px solid #B8960C44",width:700,maxHeight:"90vh",overflowY:"auto",padding:"28px"},
  modalSm:{background:"#111827",border:"1px solid #B8960C44",width:480,maxHeight:"90vh",overflowY:"auto",padding:"28px"},
  modalTitle:{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700,color:"#f1f5f9",marginBottom:20,borderBottom:"1px solid #B8960C22",paddingBottom:14},
  formRow:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14},
  formGroup:{marginBottom:14},
  label:{display:"block",fontSize:10,letterSpacing:3,color:"#B8960C",textTransform:"uppercase",marginBottom:7},
  input:{width:"100%",background:"#0f172a",border:"1px solid #B8960C33",color:"#f1f5f9",padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  select:{width:"100%",background:"#0f172a",border:"1px solid #B8960C33",color:"#f1f5f9",padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  textarea:{width:"100%",background:"#0f172a",border:"1px solid #B8960C33",color:"#f1f5f9",padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",minHeight:72,resize:"vertical"},
  badge:(c,bg)=>({display:"inline-block",fontSize:10,padding:"2px 8px",background:bg,color:c,fontWeight:600}),
  card:{background:"#111827",border:"1px solid #B8960C22",padding:"18px 20px",marginBottom:12},
  infoBox:{background:"#0f172a",border:"1px solid #B8960C22",padding:"10px 14px",marginBottom:12},
  alertBar:(c)=>({background:c+"11",border:`1px solid ${c}44`,padding:"10px 16px",marginBottom:14,fontSize:12,color:c,display:"flex",alignItems:"center",gap:8,borderRadius:0}),
};

// ─── SHARED ATOMS ─────────────────────────────────────────────────────────────
function SemDot({color}){return <span style={S.semDot(SC[color]||SC.gray)}/>;}
function Stars({value,onChange,size=22}){return(<div style={{display:"flex",gap:3}}>{[1,2,3,4,5].map(n=>(<span key={n} onClick={()=>onChange&&onChange(n)} style={{fontSize:size,cursor:onChange?"pointer":"default",color:n<=value?"#B8960C":"#374151",transition:"color .1s"}}>★</span>))}</div>);}
function Chip({label,color="#B8960C"}){return <span style={{background:color+"22",color,fontSize:10,padding:"2px 8px",fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>{label}</span>;}

function BarProg({pct,color}){return(<div style={{background:"#0f172a",height:4,borderRadius:2,overflow:"hidden",marginTop:5}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:SC[color]||SC.gray,transition:"width .3s"}}/></div>);}

function Checklist({materia,checked,onChange,pdfsByDoc,onPdfChange}){
  const items=DOC_CHECKLIST[materia]||DOC_CHECKLIST.Otro;
  const pdfMap=pdfsByDoc||{};
  function handleFile(item,e){
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();
    r.onload=ev=>{
      onPdfChange({...pdfMap,[item]:{id:uid(),name:file.name,data:ev.target.result,fecha:new Date().toISOString()}});
      onChange({...checked,[item]:true}); // marcar automáticamente como completo al subir el PDF
    };
    r.readAsDataURL(file);
  }
  function removePdf(item){ const u={...pdfMap}; delete u[item]; onPdfChange(u); }
  return(<div style={{background:"#0f172a",border:"1px solid #B8960C22",padding:14}}>
    <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:10}}>Documentación requerida</div>
    {items.map(item=>{
      const pdf=pdfMap[item];
      return(<div key={item} style={{marginBottom:10,paddingBottom:10,borderBottom:"1px solid #B8960C11"}}>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:checked[item]?"#86efac":"#9ca3af"}}>
          <input type="checkbox" checked={!!checked[item]} onChange={e=>onChange({...checked,[item]:e.target.checked})} style={{accentColor:"#B8960C"}}/>
          {item}
        </label>
        <div style={{marginLeft:26,marginTop:6}}>
          {pdf ? (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"#111827",border:"1px solid #B8960C22",fontSize:11}}>
              <span style={{color:"#d1d5db"}}>📄 {pdf.name}</span>
              <div style={{display:"flex",gap:8}}>
                <a href={pdf.data} download={pdf.name} style={{color:"#B8960C",textDecoration:"none"}}>↓</a>
                <span style={{color:"#f87171",cursor:"pointer"}} onClick={()=>removePdf(item)}>✕</span>
              </div>
            </div>
          ) : (
            <label style={{display:"inline-block",padding:"5px 12px",background:"#B8960C18",color:"#B8960C",fontSize:11,cursor:"pointer",border:"1px solid #B8960C33"}}>
              + Adjuntar PDF de este documento<input type="file" accept="application/pdf" style={{display:"none"}} onChange={e=>handleFile(item,e)}/>
            </label>
          )}
        </div>
      </div>);
    })}
    <div style={{marginTop:6,fontSize:11,color:"#6b7280"}}>{Object.values(checked).filter(Boolean).length}/{items.length} docs {Object.values(checked).filter(Boolean).length===items.length?<span style={{color:"#16a34a"}}>✓ Completo</span>:<span style={{color:"#ea580c"}}>⚠ Incompleto</span>}</div>
  </div>);
}

function PdfAttach({pdfs,onChange}){
  function handleFile(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>onChange([...pdfs,{id:uid(),name:file.name,data:ev.target.result,fecha:new Date().toISOString()}]);r.readAsDataURL(file);}
  return(<div>
    <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:8}}>Documentos PDF</div>
    {pdfs.map(p=>(<div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",background:"#0f172a",border:"1px solid #B8960C22",marginBottom:5,fontSize:12}}>
      <span style={{color:"#d1d5db"}}>📄 {p.name}</span>
      <div style={{display:"flex",gap:8}}>
        <a href={p.data} download={p.name} style={{fontSize:11,color:"#B8960C",textDecoration:"none"}}>↓</a>
        <span style={{fontSize:11,color:"#f87171",cursor:"pointer"}} onClick={()=>onChange(pdfs.filter(x=>x.id!==p.id))}>✕</span>
      </div>
    </div>))}
    <label style={{display:"inline-block",marginTop:6,padding:"6px 14px",background:"#B8960C22",color:"#B8960C",fontSize:11,cursor:"pointer",border:"1px solid #B8960C44"}}>
      + Adjuntar PDF<input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleFile}/>
    </label>
  </div>);
}

// ─── BITÁCORA ─────────────────────────────────────────────────────────────────
function Bitacora({log,onAdd}){
  const [texto,setTexto]=useState("");
  const [tipo,setTipo]=useState("Nota");
  function agregar(){if(!texto.trim())return;onAdd({id:uid(),texto,tipo,fecha:new Date().toISOString()});setTexto("");}
  const TIPOS=["Nota","Audiencia","Escrito","Resolución","Notificación","Pago","Otro"];
  const TIPO_COLOR={"Nota":"#6b7280","Audiencia":"#2563eb","Escrito":"#7c3aed","Resolución":"#16a34a","Notificación":"#ca8a04","Pago":"#B8960C","Otro":"#6b7280"};
  return(<div>
    <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:10}}>Bitácora de movimientos</div>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <select style={{...S.select,width:130}} value={tipo} onChange={e=>setTipo(e.target.value)}>{TIPOS.map(t=><option key={t}>{t}</option>)}</select>
      <input style={{...S.input,flex:1}} value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Descripción del movimiento..." onKeyDown={e=>e.key==="Enter"&&agregar()}/>
      <button style={{...S.btn,...S.btnPrimary,whiteSpace:"nowrap"}} onClick={agregar}>+ Agregar</button>
    </div>
    {(!log||log.length===0)&&<div style={{fontSize:12,color:"#6b7280",padding:"8px 0"}}>Sin movimientos registrados.</div>}
    {(log||[]).slice().reverse().map((e,i)=>(
      <div key={e.id||i} style={{display:"flex",gap:10,marginBottom:10,alignItems:"flex-start",padding:"8px 12px",background:"#0f172a",borderLeft:`2px solid ${TIPO_COLOR[e.tipo]||"#6b7280"}`}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <span style={{fontSize:10,background:(TIPO_COLOR[e.tipo]||"#6b7280")+"22",color:TIPO_COLOR[e.tipo]||"#6b7280",padding:"1px 7px",fontWeight:600}}>{e.tipo||"Nota"}</span>
            <span style={{fontSize:11,color:"#6b7280"}}>{fmtDate(e.fecha)}</span>
          </div>
          <div style={{fontSize:13,color:"#d1d5db"}}>{e.texto}</div>
        </div>
      </div>
    ))}
  </div>);
}

// ─── NOTAS RÁPIDAS ────────────────────────────────────────────────────────────
function NotasRapidas({notas,currentUser,onAdd}){
  const [texto,setTexto]=useState("");
  function enviar(){if(!texto.trim())return;onAdd({id:uid(),texto,autor:currentUser.name,fecha:new Date().toISOString()});setTexto("");}
  return(<div>
    <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:10}}>Notas rápidas del equipo</div>
    <div style={{maxHeight:200,overflowY:"auto",marginBottom:10}}>
      {(!notas||notas.length===0)&&<div style={{fontSize:12,color:"#6b7280"}}>Sin notas aún.</div>}
      {(notas||[]).slice().reverse().map((n,i)=>(
        <div key={n.id||i} style={{padding:"8px 12px",background:"#0f172a",marginBottom:6,borderRadius:0}}>
          <div style={{fontSize:11,color:"#B8960C",marginBottom:3}}>{n.autor} · {fmtDate(n.fecha)}</div>
          <div style={{fontSize:13,color:"#d1d5db"}}>{n.texto}</div>
        </div>
      ))}
    </div>
    <div style={{display:"flex",gap:8}}>
      <input style={{...S.input,flex:1}} value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Escribe una nota..." onKeyDown={e=>e.key==="Enter"&&enviar()}/>
      <button style={{...S.btn,...S.btnPrimary}} onClick={enviar}>Enviar</button>
    </div>
  </div>);
}

// ─── HONORARIOS MINI ──────────────────────────────────────────────────────────
function HonorariosMini({honorarios,onUpdate}){
  const h=honorarios||{monto:0,pagado:0,pagos:[]};
  const saldo=h.monto-h.pagado;
  const [monto,setMonto]=useState(h.monto);
  const [nuevoPago,setNuevoPago]=useState("");
  const [editMonto,setEditMonto]=useState(false);
  function guardarMonto(){onUpdate({...h,monto:parseFloat(monto)||0});setEditMonto(false);}
  function registrarPago(){
    const p=parseFloat(nuevoPago)||0;if(!p)return;
    const pagos=[...(h.pagos||[]),{id:uid(),monto:p,fecha:new Date().toISOString()}];
    const pagado=pagos.reduce((a,x)=>a+x.monto,0);
    onUpdate({...h,pagos,pagado});setNuevoPago("");
  }
  const pct=h.monto>0?Math.min(100,(h.pagado/h.monto)*100):0;
  const color=saldo<=0?"green":pct>50?"yellow":"red";
  return(<div>
    <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:10}}>Honorarios</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
      <div style={{...S.infoBox,textAlign:"center"}}><div style={{fontSize:10,color:"#6b7280",marginBottom:3}}>PACTADO</div><div style={{fontSize:15,fontWeight:700,color:"#f1f5f9"}}>{fmtMoney(h.monto)}</div></div>
      <div style={{...S.infoBox,textAlign:"center"}}><div style={{fontSize:10,color:"#6b7280",marginBottom:3}}>PAGADO</div><div style={{fontSize:15,fontWeight:700,color:"#16a34a"}}>{fmtMoney(h.pagado)}</div></div>
      <div style={{...S.infoBox,textAlign:"center",background:SC[color]+"11",border:`1px solid ${SC[color]}44`}}><div style={{fontSize:10,color:"#6b7280",marginBottom:3}}>SALDO</div><div style={{fontSize:15,fontWeight:700,color:SC[color]}}>{fmtMoney(saldo)}</div></div>
    </div>
    <BarProg pct={pct} color={color}/>
    <div style={{fontSize:11,color:"#6b7280",marginTop:4,marginBottom:12}}>{Math.round(pct)}% cubierto</div>
    {!editMonto&&<button style={{...S.btn,...S.btnGhost,marginBottom:10,fontSize:10}} onClick={()=>setEditMonto(true)}>Editar monto pactado</button>}
    {editMonto&&<div style={{display:"flex",gap:8,marginBottom:10}}>
      <input type="number" style={{...S.input,flex:1}} value={monto} onChange={e=>setMonto(e.target.value)} placeholder="Monto total"/>
      <button style={{...S.btn,...S.btnPrimary}} onClick={guardarMonto}>Guardar</button>
      <button style={{...S.btn,...S.btnGhost}} onClick={()=>setEditMonto(false)}>✕</button>
    </div>}
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <input type="number" style={{...S.input,flex:1}} value={nuevoPago} onChange={e=>setNuevoPago(e.target.value)} placeholder="Registrar pago $"/>
      <button style={{...S.btn,...S.btnGreen}} onClick={registrarPago}>+ Pago</button>
    </div>
    {(h.pagos||[]).slice().reverse().slice(0,4).map((p,i)=>(
      <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:"1px solid #B8960C11",color:"#9ca3af"}}>
        <span>💰 Pago recibido</span><span>{fmtMoney(p.monto)}</span><span style={{color:"#6b7280"}}>{fmtDate(p.fecha)}</span>
      </div>
    ))}
  </div>);
}

// ─── ENCUESTA PÚBLICA ─────────────────────────────────────────────────────────
function EncuestaPublica({token,onSubmit}){
  const info=decodeToken(token);
  const [estrellas,setEstrellas]=useState(0);
  const [comentario,setComentario]=useState("");
  const [nombre,setNombre]=useState(info?.nombre||"");
  const [enviado,setEnviado]=useState(false);
  if(!info)return(<div style={{minHeight:"100vh",background:"#0a0f1e",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#f87171"}}>Enlace inválido.</div></div>);
  function enviar(){if(!estrellas){alert("Seleccione una calificación.");return;}onSubmit({id:uid(),casoId:info.id,expediente:info.exp,materia:info.materia,nombre,estrellas,comentario,fecha:new Date().toISOString(),aprobado:false,rechazado:false,publicado:false});setEnviado(true);}
  if(enviado)return(<div style={{minHeight:"100vh",background:"#0a0f1e",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:"#111827",border:"1px solid #B8960C44",padding:"48px 40px",maxWidth:480,textAlign:"center"}}><div style={{fontSize:48,marginBottom:16}}>✓</div><div style={{fontFamily:"Georgia,serif",fontSize:24,color:"#B8960C",marginBottom:12}}>¡Gracias por su opinión!</div><div style={{fontSize:14,color:"#9ca3af",lineHeight:1.8}}>Su testimonio ha sido recibido y será revisado antes de publicarse.</div></div></div>);
  return(<div style={{minHeight:"100vh",background:"#0a0f1e",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{background:"#111827",border:"1px solid #B8960C44",padding:"40px 36px",width:"100%",maxWidth:500}}>
      <div style={{textAlign:"center",marginBottom:28}}><div style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:700,color:"#B8960C",letterSpacing:4}}>REYCO</div><div style={{fontSize:10,color:"#6b7280",letterSpacing:3,textTransform:"uppercase",marginTop:3}}>Encuesta de satisfacción</div></div>
      <div style={{...S.infoBox,marginBottom:22}}><div style={{fontSize:10,color:"#6b7280",letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>Expediente</div><div style={{fontSize:14,color:"#f1f5f9",fontWeight:600}}>{info.exp} · {info.materia}</div></div>
      <div style={{marginBottom:18}}><label style={S.label}>Su nombre</label><input style={S.input} value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Nombre completo"/></div>
      <div style={{marginBottom:18}}><label style={S.label}>Calificación del servicio</label><Stars value={estrellas} onChange={setEstrellas} size={34}/>{estrellas>0&&<div style={{fontSize:11,color:"#B8960C",marginTop:6}}>{["","Deficiente","Regular","Bueno","Muy bueno","Excelente"][estrellas]}</div>}</div>
      <div style={{marginBottom:24}}><label style={S.label}>Comentario (opcional)</label><textarea style={{...S.textarea,minHeight:90}} value={comentario} onChange={e=>setComentario(e.target.value)} placeholder="Comparta su experiencia..."/></div>
      <button style={{...S.btn,...S.btnPrimary,width:"100%",padding:13,fontSize:12,letterSpacing:2}} onClick={enviar}>Enviar opinión</button>
    </div>
  </div>);
}

// ─── ENVIAR ENCUESTA MODAL ────────────────────────────────────────────────────
function EnviarEncuestaModal({caso,onClose}){
  const [tel,setTel]=useState(caso.telCliente||"");
  const [email,setEmail]=useState(caso.emailCliente||"");
  const url=encuestaURL(caso);
  const txtWA=`Estimado/a *${caso.demandante}*,\n\nGracias por confiar en el *Bufete REYCO*.\nSu caso *${caso.expediente}* ha sido concluido.\n\nNos gustaría conocer su experiencia:\n${url}\n\n_Bufete REYCO · Puebla, México_`;
  return(<div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={S.modalSm}>
      <div style={S.modalTitle}>Enviar encuesta de satisfacción</div>
      <div style={{...S.infoBox,marginBottom:18}}><div style={{fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:2,marginBottom:3}}>Caso</div><div style={{fontSize:14,color:"#f1f5f9",fontWeight:600}}>{caso.expediente} — {caso.demandante} vs {caso.demandado}</div></div>
      <div style={{marginBottom:12}}><label style={S.label}>WhatsApp del cliente</label><input style={S.input} value={tel} onChange={e=>setTel(e.target.value)} placeholder="52 222 XXX XXXX"/></div>
      <div style={{marginBottom:18}}><label style={S.label}>Correo electrónico</label><input style={S.input} value={email} onChange={e=>setEmail(e.target.value)} placeholder="cliente@correo.com"/></div>
      <div style={{marginBottom:18}}><label style={S.label}>Enlace de la encuesta</label><div style={{display:"flex",gap:8}}><input style={{...S.input,fontSize:11,color:"#6b7280"}} value={url} readOnly/><button style={{...S.btn,...S.btnGhost,whiteSpace:"nowrap"}} onClick={()=>{navigator.clipboard?.writeText(url);alert("Copiado");}}>Copiar</button></div></div>
      <div style={{display:"flex",gap:10}}>
        <a href={waMsg(tel,txtWA)} target="_blank" rel="noopener noreferrer" style={{...S.btn,...S.btnPrimary,textDecoration:"none",display:"flex",alignItems:"center",gap:6,flex:1,justifyContent:"center"}}>📱 WhatsApp</a>
        <a href={mailMsg(email,`Encuesta — ${caso.expediente}`,`Estimado/a ${caso.demandante},\n\nComparta su experiencia:\n${url}\n\nBufete REYCO`)} style={{...S.btn,...S.btnGhost,textDecoration:"none",display:"flex",alignItems:"center",gap:6,flex:1,justifyContent:"center"}}>✉ Correo</a>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}><button style={{...S.btn,...S.btnGhost}} onClick={onClose}>Cerrar</button></div>
    </div>
  </div>);
}

// ─── TESTIMONIALES ADMIN ──────────────────────────────────────────────────────
function TestimonialesAdmin({testimoniales,onUpdate}){
  const pendientes=testimoniales.filter(t=>!t.aprobado&&!t.rechazado);
  const aprobados=testimoniales.filter(t=>t.aprobado);
  const [tab,setTab]=useState("pendientes");
  function aprobar(id){onUpdate(testimoniales.map(t=>t.id===id?{...t,aprobado:true,rechazado:false,publicado:true}:t));}
  function rechazar(id){onUpdate(testimoniales.map(t=>t.id===id?{...t,rechazado:true,aprobado:false,publicado:false}:t));}
  function togglePub(id){onUpdate(testimoniales.map(t=>t.id===id?{...t,publicado:!t.publicado}:t));}
  function eliminar(id){if(!confirm("¿Eliminar?"))return;onUpdate(testimoniales.filter(t=>t.id!==id));}
  const tabSt=(a)=>({padding:"9px 20px",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",color:a?"#B8960C":"#6b7280",borderBottom:a?"2px solid #B8960C":"2px solid transparent",background:"transparent",border:"none",fontFamily:"inherit"});
  const list=tab==="pendientes"?pendientes:aprobados;
  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Testimoniales</div><div style={S.pageSubtitle}>Gestión y publicación en sitio web</div></div></div>
    <div style={{...S.statGrid,gridTemplateColumns:"repeat(3,1fr)",marginBottom:20}}>
      <div style={S.statCard("#ca8a04")}><div style={{...S.statNum,color:"#ca8a04"}}>{pendientes.length}</div><div style={S.statLabel}>Pendientes</div></div>
      <div style={S.statCard("#16a34a")}><div style={{...S.statNum,color:"#16a34a"}}>{aprobados.length}</div><div style={S.statLabel}>Aprobados</div></div>
      <div style={S.statCard("#B8960C")}><div style={{...S.statNum,color:"#B8960C"}}>{aprobados.filter(t=>t.publicado).length}</div><div style={S.statLabel}>Publicados</div></div>
    </div>
    <div style={{display:"flex",borderBottom:"1px solid #B8960C22",marginBottom:18}}>
      <button style={tabSt(tab==="pendientes")} onClick={()=>setTab("pendientes")}>Pendientes ({pendientes.length})</button>
      <button style={tabSt(tab==="aprobados")} onClick={()=>setTab("aprobados")}>Aprobados ({aprobados.length})</button>
    </div>
    {list.length===0&&<div style={{...S.card,textAlign:"center",fontSize:13,color:"#6b7280"}}>Sin registros en esta sección.</div>}
    {list.map(t=>(<div key={t.id} style={{...S.card,border:`1px solid ${t.aprobado?"#16a34a33":"#B8960C22"}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div><div style={{fontSize:14,fontWeight:600,color:"#f1f5f9"}}>{t.nombre}</div><div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{t.expediente} · {t.materia} · {fmtDate(t.fecha)}</div></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><Stars value={t.estrellas} size={16}/><span style={{fontSize:12,color:"#B8960C",fontWeight:700}}>{t.estrellas}/5</span></div>
      </div>
      {t.comentario&&<div style={{fontSize:13,color:"#9ca3af",fontStyle:"italic",lineHeight:1.8,background:"#0f172a",padding:"10px 14px",marginBottom:12,borderLeft:"2px solid #B8960C44"}}>"{t.comentario}"</div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {!t.aprobado&&<button style={{...S.btn,...S.btnGreen}} onClick={()=>aprobar(t.id)}>✓ Aprobar</button>}
        {!t.aprobado&&<button style={{...S.btn,...S.btnDanger}} onClick={()=>rechazar(t.id)}>✕ Rechazar</button>}
        {t.aprobado&&<button style={{...S.btn,background:t.publicado?"#16a34a22":"#0f172a",color:t.publicado?"#86efac":"#9ca3af",border:`1px solid ${t.publicado?"#16a34a44":"#B8960C22"}`}} onClick={()=>togglePub(t.id)}>{t.publicado?"✓ Publicado":"○ Publicar"}</button>}
        <button style={{...S.btn,...S.btnDanger}} onClick={()=>eliminar(t.id)}>Eliminar</button>
      </div>
    </div>))}
  </div>);
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
function Clientes({clientes,cases,onUpdate}){
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [detail,setDetail]=useState(null);
  const visible=clientes.filter(c=>!search||c.nombre?.toLowerCase().includes(search.toLowerCase())||c.rfc?.toLowerCase().includes(search.toLowerCase())||c.tel?.includes(search));
  function save(c){const u=clientes.find(x=>x.id===c.id)?clientes.map(x=>x.id===c.id?c:x):[...clientes,c];onUpdate(u);setModal(null);}
  function del(id){if(!confirm("¿Eliminar cliente?"))return;onUpdate(clientes.filter(c=>c.id!==id));}
  function casosDe(id){return cases.filter(c=>c.clienteId===id);}
  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Directorio de Clientes</div><div style={S.pageSubtitle}>{clientes.length} cliente{clientes.length!==1?"s":""} registrados</div></div><button style={{...S.btn,...S.btnPrimary}} onClick={()=>setModal({})}>+ Nuevo cliente</button></div>
    <input style={{...S.input,maxWidth:280,marginBottom:18}} placeholder="Buscar por nombre, RFC o teléfono..." value={search} onChange={e=>setSearch(e.target.value)}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
      {visible.length===0&&<div style={{...S.card,gridColumn:"1/-1",textAlign:"center",color:"#6b7280",fontSize:13}}>Sin clientes registrados. Crea el primero.</div>}
      {visible.map(c=>{
        const cc=casosDe(c.id);
        const urgentes=cc.filter(x=>semaforo(x.fechaLimite,x.docsCompletos,{amarillo:28,rojo:14})==="red").length;
        return(<div key={c.id} style={{...S.card,cursor:"pointer",borderLeft:urgentes>0?"3px solid #dc2626":"3px solid #B8960C44"}} onClick={()=>setDetail(c)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:"#B8960C22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"#B8960C"}}>{c.nombre?c.nombre[0].toUpperCase():"?"}</div>
            <div style={{display:"flex",gap:6}}>
              {urgentes>0&&<span style={{fontSize:10,color:"#dc2626",fontWeight:700}}>⚠{urgentes}</span>}
              <button style={{...S.btn,...S.btnGhost,padding:"3px 8px",fontSize:10}} onClick={e=>{e.stopPropagation();setModal(c);}}>Editar</button>
              <button style={{...S.btn,...S.btnDanger,padding:"3px 8px",fontSize:10}} onClick={e=>{e.stopPropagation();del(c.id);}}>✕</button>
            </div>
          </div>
          <div style={{fontSize:14,fontWeight:600,color:"#f1f5f9",marginBottom:3}}>{c.nombre}</div>
          {c.rfc&&<div style={{fontSize:11,color:"#6b7280"}}>RFC: {c.rfc}</div>}
          {c.tel&&<div style={{fontSize:11,color:"#6b7280"}}>📱 {c.tel}</div>}
          {c.email&&<div style={{fontSize:11,color:"#6b7280"}}>✉ {c.email}</div>}
          <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #B8960C11",display:"flex",gap:12}}>
            <span style={{fontSize:11,color:"#B8960C"}}>{cc.length} caso{cc.length!==1?"s":""}</span>
            <span style={{fontSize:11,color:"#16a34a"}}>{cc.filter(x=>x.estado==="Activo").length} activos</span>
          </div>
        </div>);
      })}
    </div>
    {modal&&<ClienteModal cliente={modal} onSave={save} onClose={()=>setModal(null)}/>}
    {detail&&<ClienteDetail cliente={detail} cases={casosDe(detail.id)} onEdit={()=>{setModal(detail);setDetail(null);}} onClose={()=>setDetail(null)}/>}
  </div>);
}

function ClienteModal({cliente,onSave,onClose}){
  const empty={id:null,nombre:"",rfc:"",tel:"",email:"",direccion:"",notas:""};
  const [f,setF]=useState(cliente?.id?{...cliente}:empty);
  function set(k,v){setF(p=>({...p,[k]:v}));}
  function save(){if(!f.nombre){alert("El nombre es obligatorio.");return;}onSave({...f,id:f.id||uid()});}
  return(<div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={S.modalSm}>
      <div style={S.modalTitle}>{f.id?"Editar cliente":"Nuevo cliente"}</div>
      <div style={S.formGroup}><label style={S.label}>Nombre completo *</label><input style={S.input} value={f.nombre} onChange={e=>set("nombre",e.target.value)}/></div>
      <div style={S.formRow}>
        <div><label style={S.label}>RFC</label><input style={S.input} value={f.rfc} onChange={e=>set("rfc",e.target.value)}/></div>
        <div><label style={S.label}>Teléfono / WhatsApp</label><input style={S.input} value={f.tel} onChange={e=>set("tel",e.target.value)}/></div>
      </div>
      <div style={S.formGroup}><label style={S.label}>Correo electrónico</label><input style={S.input} value={f.email} onChange={e=>set("email",e.target.value)}/></div>
      <div style={S.formGroup}><label style={S.label}>Dirección</label><input style={S.input} value={f.direccion} onChange={e=>set("direccion",e.target.value)}/></div>
      <div style={S.formGroup}><label style={S.label}>Notas</label><textarea style={S.textarea} value={f.notas} onChange={e=>set("notas",e.target.value)}/></div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button style={{...S.btn,...S.btnGhost}} onClick={onClose}>Cancelar</button><button style={{...S.btn,...S.btnPrimary}} onClick={save}>Guardar</button></div>
    </div>
  </div>);
}

function ClienteDetail({cliente,cases,onEdit,onClose}){
  return(<div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={S.modal}>
      <div style={S.modalTitle}>{cliente.nombre}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
        {[["RFC",cliente.rfc],["Teléfono",cliente.tel],["Email",cliente.email],["Dirección",cliente.direccion]].map(([k,v])=>v?(<div key={k} style={S.infoBox}><div style={{fontSize:10,color:"#6b7280",textTransform:"uppercase",letterSpacing:1}}>{k}</div><div style={{fontSize:13,color:"#d1d5db",marginTop:3}}>{v}</div></div>):null)}
      </div>
      {cliente.notas&&<div style={{...S.infoBox,marginBottom:18,fontSize:13,color:"#9ca3af"}}>{cliente.notas}</div>}
      <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:10}}>Historial de casos ({cases.length})</div>
      {cases.length===0&&<div style={{fontSize:13,color:"#6b7280",marginBottom:16}}>Sin casos registrados.</div>}
      {cases.map(c=>(<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:"#0f172a",marginBottom:6,fontSize:13}}>
        <div><span style={{color:"#f1f5f9",fontWeight:600}}>{c.expediente||"—"}</span><span style={{color:"#6b7280",marginLeft:8}}>{c.materia}</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}><Chip label={c.estado}/></div>
      </div>))}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}><button style={{...S.btn,...S.btnGhost}} onClick={onClose}>Cerrar</button><button style={{...S.btn,...S.btnPrimary}} onClick={onEdit}>Editar</button></div>
    </div>
  </div>);
}

// ─── AGENDA ───────────────────────────────────────────────────────────────────
function Agenda({agenda,cases,users,currentUser,onUpdate}){
  const [modal,setModal]=useState(null);
  const [filtro,setFiltro]=useState("proximas");
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const proximas=agenda.filter(a=>new Date(a.fecha)>=hoy).sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
  const pasadas=agenda.filter(a=>new Date(a.fecha)<hoy).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const list=filtro==="proximas"?proximas:pasadas;
  const visibles=currentUser.role==="superuser"?list:list.filter(a=>a.abogadoId===currentUser.id);
  function save(d){const u=agenda.find(x=>x.id===d.id)?agenda.map(x=>x.id===d.id?d:x):[...agenda,d];onUpdate(u);setModal(null);}
  function del(id){if(!confirm("¿Eliminar?"))return;onUpdate(agenda.filter(a=>a.id!==id));}
  const TIPO_COLOR={"Audiencia":"#2563eb","Presentación de escrito":"#7c3aed","Notificación":"#ca8a04","Junta":"#B8960C","Vencimiento de plazo":"#dc2626","Diligencia":"#16a34a","Otro":"#6b7280"};
  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Agenda de Diligencias</div><div style={S.pageSubtitle}>{proximas.length} próximas · {pasadas.length} pasadas</div></div><button style={{...S.btn,...S.btnPrimary}} onClick={()=>setModal({})}>+ Nueva diligencia</button></div>
    <div style={{display:"flex",gap:0,borderBottom:"1px solid #B8960C22",marginBottom:18}}>
      {[["proximas","Próximas"],["pasadas","Pasadas"]].map(([k,l])=>(<button key={k} style={{padding:"9px 20px",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",color:filtro===k?"#B8960C":"#6b7280",borderBottom:filtro===k?"2px solid #B8960C":"2px solid transparent",background:"transparent",border:"none",fontFamily:"inherit"}} onClick={()=>setFiltro(k)}>{l}</button>))}
    </div>
    {visibles.length===0&&<div style={{...S.card,textAlign:"center",color:"#6b7280",fontSize:13}}>Sin diligencias en esta vista.</div>}
    {visibles.map(a=>{
      const caso=cases.find(c=>c.id===a.casoId);
      const dias=diasRestantes(a.fecha);
      const color=dias===null?"gray":dias<0?"gray":dias===0?"red":dias<=3?"red":dias<=7?"orange":dias<=14?"yellow":"green";
      return(<div key={a.id} style={{...S.card,borderLeft:`3px solid ${TIPO_COLOR[a.tipo]||"#6b7280"}`,background:dias!==null&&dias<=3&&dias>=0?"#dc262610":"#111827"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
              <span style={{background:(TIPO_COLOR[a.tipo]||"#6b7280")+"22",color:TIPO_COLOR[a.tipo]||"#6b7280",fontSize:10,padding:"2px 8px",fontWeight:600}}>{a.tipo}</span>
              <span style={{fontSize:12,color:SC[color],fontWeight:700}}>{fmtDate(a.fecha)}{dias!==null&&dias>=0?` · ${dias}d`:dias<0?" · Pasada":""}</span>
              {a.hora&&<span style={{fontSize:12,color:"#6b7280"}}>🕐 {a.hora}</span>}
            </div>
            <div style={{fontSize:14,fontWeight:600,color:"#f1f5f9",marginBottom:3}}>{a.descripcion}</div>
            {caso&&<div style={{fontSize:11,color:"#6b7280"}}>📁 {caso.expediente} — {caso.demandante} vs {caso.demandado}</div>}
            {a.lugar&&<div style={{fontSize:11,color:"#6b7280"}}>📍 {a.lugar}</div>}
            {a.notas&&<div style={{fontSize:12,color:"#9ca3af",marginTop:6,fontStyle:"italic"}}>{a.notas}</div>}
          </div>
          <div style={{display:"flex",gap:6,marginLeft:12}}>
            <button style={{...S.btn,...S.btnGhost,padding:"4px 10px",fontSize:10}} onClick={()=>setModal(a)}>Editar</button>
            <button style={{...S.btn,...S.btnDanger,padding:"4px 10px",fontSize:10}} onClick={()=>del(a.id)}>✕</button>
          </div>
        </div>
      </div>);
    })}
    {modal!==null&&<DiligenciaModal diligencia={modal} cases={cases} users={users} currentUser={currentUser} onSave={save} onClose={()=>setModal(null)}/>}
  </div>);
}

function DiligenciaModal({diligencia,cases,users,currentUser,onSave,onClose}){
  const empty={id:null,tipo:"Audiencia",descripcion:"",fecha:"",hora:"",lugar:"",casoId:"",abogadoId:currentUser.id,notas:""};
  const [f,setF]=useState(diligencia?.id?{...diligencia}:empty);
  function set(k,v){setF(p=>({...p,[k]:v}));}
  function save(){if(!f.descripcion||!f.fecha){alert("Completa descripción y fecha.");return;}onSave({...f,id:f.id||uid()});}
  const abogados=users.filter(u=>u.role==="abogado"||u.role==="superuser");
  return(<div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={S.modalSm}>
      <div style={S.modalTitle}>{f.id?"Editar diligencia":"Nueva diligencia"}</div>
      <div style={S.formRow}><div><label style={S.label}>Tipo</label><select style={S.select} value={f.tipo} onChange={e=>set("tipo",e.target.value)}>{TIPO_DILIGENCIA.map(t=><option key={t}>{t}</option>)}</select></div><div><label style={S.label}>Fecha *</label><input type="date" style={S.input} value={f.fecha} onChange={e=>set("fecha",e.target.value)}/></div></div>
      <div style={S.formRow}><div><label style={S.label}>Hora</label><input type="time" style={S.input} value={f.hora} onChange={e=>set("hora",e.target.value)}/></div><div><label style={S.label}>Abogado</label><select style={S.select} value={f.abogadoId} onChange={e=>set("abogadoId",e.target.value)}>{abogados.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div></div>
      <div style={S.formGroup}><label style={S.label}>Descripción *</label><input style={S.input} value={f.descripcion} onChange={e=>set("descripcion",e.target.value)} placeholder="Ej. Audiencia inicial ante Juzgado 3ro..."/></div>
      <div style={S.formRow}><div><label style={S.label}>Lugar / Juzgado</label><input style={S.input} value={f.lugar} onChange={e=>set("lugar",e.target.value)}/></div><div><label style={S.label}>Expediente vinculado</label><select style={S.select} value={f.casoId} onChange={e=>set("casoId",e.target.value)}><option value="">— Sin vincular —</option>{cases.map(c=><option key={c.id} value={c.id}>{c.expediente} · {c.demandante}</option>)}</select></div></div>
      <div style={S.formGroup}><label style={S.label}>Notas</label><textarea style={S.textarea} value={f.notas} onChange={e=>set("notas",e.target.value)}/></div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button style={{...S.btn,...S.btnGhost}} onClick={onClose}>Cancelar</button><button style={{...S.btn,...S.btnPrimary}} onClick={save}>Guardar</button></div>
    </div>
  </div>);
}

// ─── REPORTES ─────────────────────────────────────────────────────────────────
// ─── BITÁCORA GENERAL ─────────────────────────────────────────────────────────
function BitacoraGeneral({cases,users}){
  const [filtroAbogado,setFiltroAbogado]=useState("");
  const [filtroMateria,setFiltroMateria]=useState("");
  const [filtroTipo,setFiltroTipo]=useState("");
  const [search,setSearch]=useState("");
  const TIPOS=["Nota","Audiencia","Escrito","Resolución","Notificación","Pago","Otro","Sistema"];
  const TIPO_COLOR={"Nota":"#6b7280","Audiencia":"#2563eb","Escrito":"#7c3aed","Resolución":"#16a34a","Notificación":"#ca8a04","Pago":"#B8960C","Otro":"#6b7280","Sistema":"#374151"};

  // Combina todos los movimientos de bitácora de todos los expedientes en una sola lista
  const allEntries=[];
  cases.forEach(c=>{
    (c.log||[]).forEach(entry=>{
      allEntries.push({
        ...entry,
        caso:c,
        abogado:users.find(u=>u.id===c.abogadoId),
      });
    });
  });

  const filtered=allEntries
    .filter(e=>!filtroAbogado||e.caso.abogadoId===filtroAbogado)
    .filter(e=>!filtroMateria||e.caso.materia===filtroMateria)
    .filter(e=>!filtroTipo||e.tipo===filtroTipo)
    .filter(e=>!search||e.texto?.toLowerCase().includes(search.toLowerCase())||e.caso.expediente?.toLowerCase().includes(search.toLowerCase())||e.caso.demandante?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));

  const abogados=users.filter(u=>u.role==="abogado"||u.role==="superuser");

  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Bitácora General</div><div style={S.pageSubtitle}>{filtered.length} movimiento{filtered.length!==1?"s":""} de todos los expedientes</div></div></div>

    <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
      <input style={{...S.input,width:220}} placeholder="Buscar texto, expediente o nombre..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <select style={{...S.select,width:170}} value={filtroAbogado} onChange={e=>setFiltroAbogado(e.target.value)}>
        <option value="">Todos los abogados</option>
        {abogados.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select style={{...S.select,width:150}} value={filtroMateria} onChange={e=>setFiltroMateria(e.target.value)}>
        <option value="">Todas las materias</option>
        {MATERIAS.map(m=><option key={m}>{m}</option>)}
      </select>
      <select style={{...S.select,width:150}} value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}>
        <option value="">Todos los tipos</option>
        {TIPOS.map(t=><option key={t}>{t}</option>)}
      </select>
    </div>

    {filtered.length===0&&<div style={{...S.card,textAlign:"center",color:"#6b7280",fontSize:13}}>Sin movimientos que coincidan con los filtros.</div>}

    {filtered.map((e,i)=>(
      <div key={e.id||i} style={{display:"flex",gap:10,marginBottom:10,alignItems:"flex-start",padding:"10px 14px",background:"#111827",border:"1px solid #B8960C18",borderLeft:`3px solid ${TIPO_COLOR[e.tipo]||"#6b7280"}`}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
            <span style={{fontSize:10,background:(TIPO_COLOR[e.tipo]||"#6b7280")+"22",color:TIPO_COLOR[e.tipo]||"#6b7280",padding:"2px 8px",fontWeight:600}}>{e.tipo||"Nota"}</span>
            <span style={{fontSize:11,color:"#6b7280"}}>{fmtDate(e.fecha)}</span>
            <span style={{fontSize:11,color:"#B8960C"}}>· {e.caso.expediente||"Sin expediente"}</span>
            <Chip label={e.caso.materia}/>
            {e.abogado&&<span style={{fontSize:11,color:"#6b7280"}}>· {e.abogado.name}</span>}
          </div>
          <div style={{fontSize:13,color:"#d1d5db",marginBottom:3}}>{e.texto}</div>
          <div style={{fontSize:11,color:"#6b7280"}}>{e.caso.demandante} <span style={{color:"#374151"}}>vs</span> {e.caso.demandado}</div>
        </div>
      </div>
    ))}
  </div>);
}

function Reportes({cases,clientes,agenda,testimoniales,cfg}){
  const activos=cases.filter(c=>c.estado==="Activo");
  const cerrados=cases.filter(c=>c.estado==="Cerrado"||c.estado==="Archivado");
  const counts={green:0,yellow:0,orange:0,red:0,gray:0};
  activos.forEach(c=>counts[semaforo(c.fechaLimite,c.docsCompletos,cfg)]++);
  const totalHon=cases.reduce((a,c)=>(a+(c.honorarios?.monto||0)),0);
  const totalPag=cases.reduce((a,c)=>(a+(c.honorarios?.pagado||0)),0);
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const prox7=agenda.filter(a=>{const d=diasRestantes(a.fecha);return d!==null&&d>=0&&d<=7;});

  function exportCSV(){
    const rows=[["Expediente","Materia","Demandante","Demandado","Estado","Fecha inicio","Fecha límite","Días restantes","Docs completos","Honorarios pactados","Honorarios pagados"]];
    cases.forEach(c=>rows.push([c.expediente,c.materia,c.demandante,c.demandado,c.estado,c.fechaInicio,c.fechaLimite,diasRestantes(c.fechaLimite)??"",c.docsCompletos?"Sí":"No",c.honorarios?.monto||0,c.honorarios?.pagado||0]));
    const csv=rows.map(r=>r.map(x=>`"${x}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="reyco_casos.csv";a.click();URL.revokeObjectURL(url);
  }

  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Reportes</div><div style={S.pageSubtitle}>Resumen ejecutivo del sistema</div></div><button style={{...S.btn,...S.btnPrimary}} onClick={exportCSV}>↓ Exportar CSV</button></div>

    <div style={{...S.statGrid,gridTemplateColumns:"repeat(4,1fr)",marginBottom:20}}>
      <div style={{...S.statCard("#B8960C"),background:"#B8960C11"}}><div style={{...S.statNum,color:"#B8960C"}}>{cases.length}</div><div style={S.statLabel}>Total casos</div></div>
      <div style={{...S.statCard("#16a34a"),background:"#16a34a11"}}><div style={{...S.statNum,color:"#16a34a"}}>{cerrados.length}</div><div style={S.statLabel}>Concluidos</div></div>
      <div style={{...S.statCard("#2563eb"),background:"#2563eb11"}}><div style={{...S.statNum,color:"#93c5fd"}}>{clientes.length}</div><div style={S.statLabel}>Clientes</div></div>
      <div style={{...S.statCard("#dc2626"),background:"#dc262611"}}><div style={{...S.statNum,color:"#dc2626"}}>{counts.red}</div><div style={S.statLabel}>Urgentes</div></div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
      {/* Semáforo */}
      <div style={S.card}>
        <div style={{fontSize:11,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:14}}>Estado del semáforo</div>
        {[["green","🟢 Al día",counts.green],["yellow","🟡 Próximos",counts.yellow+counts.orange],["red","🔴 Urgentes",counts.red],["gray","⚪ Sin fecha",counts.gray]].map(([c,l,n])=>(<div key={c} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #B8960C11"}}>
          <span style={{fontSize:13,color:SC[c]}}>{l}</span><span style={{fontSize:18,fontWeight:700,color:SC[c]}}>{n}</span>
        </div>))}
      </div>
      {/* Honorarios */}
      <div style={S.card}>
        <div style={{fontSize:11,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:14}}>Honorarios globales</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div style={S.infoBox}><div style={{fontSize:10,color:"#6b7280"}}>TOTAL PACTADO</div><div style={{fontSize:16,fontWeight:700,color:"#f1f5f9",marginTop:3}}>{fmtMoney(totalHon)}</div></div>
          <div style={S.infoBox}><div style={{fontSize:10,color:"#6b7280"}}>TOTAL COBRADO</div><div style={{fontSize:16,fontWeight:700,color:"#16a34a",marginTop:3}}>{fmtMoney(totalPag)}</div></div>
        </div>
        <div style={S.infoBox}><div style={{fontSize:10,color:"#6b7280"}}>SALDO PENDIENTE</div><div style={{fontSize:18,fontWeight:700,color:totalHon-totalPag>0?"#dc2626":"#16a34a",marginTop:3}}>{fmtMoney(totalHon-totalPag)}</div></div>
        <BarProg pct={totalHon>0?(totalPag/totalHon)*100:0} color={totalHon>0&&totalPag>=totalHon?"green":"yellow"}/>
      </div>
    </div>

    {/* Por materia */}
    <div style={S.card}>
      <div style={{fontSize:11,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:14}}>Casos por materia</div>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Materia</th><th style={S.th}>Total</th><th style={S.th}>Activos</th><th style={S.th}>Cerrados</th><th style={S.th}>Urgentes</th><th style={S.th}>Honorarios cobrados</th></tr></thead>
        <tbody>{MATERIAS.map(m=>{
          const all=cases.filter(c=>c.materia===m);
          if(!all.length)return null;
          const urg=all.filter(c=>semaforo(c.fechaLimite,c.docsCompletos,cfg)==="red").length;
          const hon=all.reduce((a,c)=>(a+(c.honorarios?.pagado||0)),0);
          return(<tr key={m}><td style={{...S.td,color:"#f1f5f9",fontWeight:600}}>{m}</td><td style={S.td}>{all.length}</td><td style={S.td}>{all.filter(c=>c.estado==="Activo").length}</td><td style={S.td}>{all.filter(c=>c.estado==="Cerrado"||c.estado==="Archivado").length}</td><td style={{...S.td,color:urg>0?"#dc2626":"#6b7280"}}>{urg>0?`⚠ ${urg}`:0}</td><td style={{...S.td,color:"#16a34a"}}>{fmtMoney(hon)}</td></tr>);
        })}</tbody>
      </table>
    </div>

    {/* Próximas diligencias */}
    {prox7.length>0&&<div style={S.card}>
      <div style={{fontSize:11,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:14}}>⚡ Diligencias en los próximos 7 días ({prox7.length})</div>
      {prox7.map(a=>{const d=diasRestantes(a.fecha);return(<div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #B8960C11",fontSize:13}}>
        <div><span style={{color:"#f1f5f9",fontWeight:600}}>{a.descripcion}</span><span style={{color:"#6b7280",marginLeft:8}}>{a.tipo}</span></div>
        <span style={{color:d<=1?"#dc2626":d<=3?"#ea580c":"#ca8a04",fontWeight:700}}>{fmtDate(a.fecha)} · {d}d</span>
      </div>);})}
    </div>}
  </div>);
}

// ─── NOTIFICACIONES ───────────────────────────────────────────────────────────
function PanelNotificaciones({cases,agenda,testimoniales,cfg,onClose}){
  const urgentes=cases.filter(c=>semaforo(c.fechaLimite,c.docsCompletos,cfg)==="red"&&c.estado==="Activo");
  const proximos=cases.filter(c=>semaforo(c.fechaLimite,c.docsCompletos,cfg)==="yellow"&&c.estado==="Activo");
  const pendTest=testimoniales.filter(t=>!t.aprobado&&!t.rechazado);
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const dilig=agenda.filter(a=>{const d=diasRestantes(a.fecha);return d!==null&&d>=0&&d<=3;});
  const total=urgentes.length+pendTest.length+dilig.length;
  return(<div style={{...S.overlay}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{...S.modal,width:520}}>
      <div style={{...S.modalTitle,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>Notificaciones {total>0&&<span style={{background:"#dc2626",color:"white",fontSize:10,borderRadius:"50%",width:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",marginLeft:8}}>{total}</span>}</span>
        <button style={{...S.btn,...S.btnGhost,padding:"4px 10px",fontSize:11}} onClick={onClose}>✕</button>
      </div>
      {total===0&&<div style={{textAlign:"center",padding:32,color:"#6b7280",fontSize:13}}>✓ Sin notificaciones pendientes.</div>}
      {urgentes.length>0&&<div style={{marginBottom:16}}>
        <div style={S.alertBar("#dc2626")}>🔴 {urgentes.length} caso{urgentes.length>1?"s":""} URGENTE{urgentes.length>1?"S":""}</div>
        {urgentes.map(c=>(<div key={c.id} style={{...S.infoBox,marginBottom:6,borderLeft:"2px solid #dc2626"}}><div style={{fontSize:13,color:"#f1f5f9",fontWeight:600}}>{c.expediente} — {c.demandante}</div><div style={{fontSize:11,color:"#dc2626"}}>Vence: {fmtDate(c.fechaLimite)} · {diasRestantes(c.fechaLimite)}d restantes</div></div>))}
      </div>}
      {dilig.length>0&&<div style={{marginBottom:16}}>
        <div style={S.alertBar("#ea580c")}>📅 {dilig.length} diligencia{dilig.length>1?"s":""} en los próximos 3 días</div>
        {dilig.map(a=>(<div key={a.id} style={{...S.infoBox,marginBottom:6,borderLeft:"2px solid #ea580c"}}><div style={{fontSize:13,color:"#f1f5f9",fontWeight:600}}>{a.descripcion}</div><div style={{fontSize:11,color:"#ea580c"}}>{fmtDate(a.fecha)}{a.hora?` · ${a.hora}`:""}{a.lugar?` · ${a.lugar}`:""}</div></div>))}
      </div>}
      {proximos.length>0&&<div style={{marginBottom:16}}>
        <div style={S.alertBar("#ca8a04")}>🟡 {proximos.length} caso{proximos.length>1?"s":""} próximos a vencer</div>
        {proximos.slice(0,5).map(c=>(<div key={c.id} style={{...S.infoBox,marginBottom:6,borderLeft:"2px solid #ca8a04"}}><div style={{fontSize:13,color:"#f1f5f9",fontWeight:600}}>{c.expediente} — {c.demandante}</div><div style={{fontSize:11,color:"#ca8a04"}}>{diasRestantes(c.fechaLimite)}d restantes · {fmtDate(c.fechaLimite)}</div></div>))}
      </div>}
      {pendTest.length>0&&<div>
        <div style={S.alertBar("#B8960C")}>📋 {pendTest.length} testimonial{pendTest.length>1?"es":""} pendiente{pendTest.length>1?"s":""} de revisión</div>
      </div>}
    </div>
  </div>);
}

// ─── DASHBOARD BUFETE ─────────────────────────────────────────────────────────
function DashboardBufete({cases,users,cfg,testimoniales,agenda,clientes}){
  const activos=cases.filter(c=>c.estado==="Activo");
  const counts={green:0,yellow:0,orange:0,red:0,gray:0};
  activos.forEach(c=>counts[semaforo(c.fechaLimite,c.docsCompletos,cfg)]++);
  const pendTest=testimoniales.filter(t=>!t.aprobado&&!t.rechazado).length;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const prox3=agenda.filter(a=>{const d=diasRestantes(a.fecha);return d!==null&&d>=0&&d<=3;});
  const sorted=[...activos].sort((a,b)=>{const ord={red:0,orange:1,yellow:2,gray:3,green:4};return ord[semaforo(a.fechaLimite,a.docsCompletos,cfg)]-ord[semaforo(b.fechaLimite,b.docsCompletos,cfg)];});

  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Dashboard — Bufete</div><div style={S.pageSubtitle}>{activos.length} expedientes activos · {clientes.length} clientes</div></div></div>

    <div style={S.statGrid}>
      <div style={{...S.statCard("#B8960C"),background:"#B8960C11"}}><div style={{...S.statNum,color:"#B8960C"}}>{activos.length}</div><div style={S.statLabel}>Total activos</div></div>
      <div style={{...S.statCard("#16a34a"),background:"#16a34a11"}}><div style={{...S.statNum,color:"#16a34a"}}>{counts.green}</div><div style={S.statLabel}>🟢 Al día</div></div>
      <div style={{...S.statCard("#ca8a04"),background:"#ca8a0411"}}><div style={{...S.statNum,color:"#ca8a04"}}>{counts.yellow+counts.orange}</div><div style={S.statLabel}>🟡 Próximos</div></div>
      <div style={{...S.statCard("#dc2626"),background:"#dc262611"}}><div style={{...S.statNum,color:"#dc2626"}}>{counts.red}</div><div style={S.statLabel}>🔴 Urgentes</div></div>
    </div>

    {pendTest>0&&<div style={S.alertBar("#B8960C")}>📋 <strong>{pendTest}</strong> testimonial{pendTest>1?"es":""} pendiente{pendTest>1?"s":""} de revisión.</div>}
    {prox3.length>0&&<div style={S.alertBar("#ea580c")}>📅 <strong>{prox3.length}</strong> diligencia{prox3.length>1?"s":""} en los próximos 3 días.</div>}

    <div style={{display:"flex",gap:16,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{fontSize:10,color:"#6b7280",letterSpacing:1,textTransform:"uppercase"}}>Semáforo:</div>
      {[["green","Al día"],["yellow","Próximo"],["orange","Docs faltantes"],["red","Urgente"]].map(([c,l])=>(<div key={c} style={{display:"flex",alignItems:"center",gap:5,fontSize:12}}><span style={{width:9,height:9,borderRadius:"50%",background:SC[c],display:"inline-block"}}/><span style={{color:SC[c]}}>{l}</span></div>))}
      <div style={{marginLeft:"auto",fontSize:10,color:"#4b5563"}}>Izq = tiempo restante · Der = tiempo en proceso</div>
    </div>

    {sorted.length===0&&<div style={{...S.card,textAlign:"center",color:"#6b7280",fontSize:13}}>Sin expedientes activos. Crea el primero desde Expedientes.</div>}
    {sorted.map(c=><CasoCard key={c.id} caso={c} cfg={cfg} abogado={users.find(u=>u.id===c.abogadoId)}/>)}

    <div style={{marginTop:20}}>
      <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:10}}>Distribución por materia</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {MATERIAS.map(m=>{const n=cases.filter(c=>c.materia===m).length;const urg=cases.filter(c=>c.materia===m&&semaforo(c.fechaLimite,c.docsCompletos,cfg)==="red").length;return n>0?(<div key={m} style={{background:"#111827",border:`1px solid ${urg>0?"#dc262644":"#B8960C22"}`,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:"#d1d5db"}}>{m}</span><div style={{display:"flex",alignItems:"center",gap:8}}>{urg>0&&<span style={{fontSize:11,color:"#dc2626",fontWeight:700}}>⚠{urg}</span>}<span style={{fontSize:15,fontWeight:700,color:"#B8960C"}}>{n}</span></div></div>):null;})}
      </div>
    </div>
  </div>);
}

function CasoCard({caso,cfg,abogado}){
  const semColor=semaforo(caso.fechaLimite,caso.docsCompletos,cfg);
  const diasRest=diasRestantes(caso.fechaLimite);
  const diasProc=diasEnProceso(caso.fechaInicio);
  const procColor=colorProceso(diasProc);
  const pctRest=diasRest!==null?Math.max(0,Math.min(100,(diasRest/cfg.amarillo)*100)):0;
  const pctProc=diasProc!==null?Math.min(100,(diasProc/180)*100):0;
  return(<div style={{background:SEM_BG[semColor],border:`1px solid ${SEM_BD[semColor]}`,borderLeft:`3px solid ${SC[semColor]}`,padding:"14px 16px",marginBottom:9}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
      <div><div style={{fontSize:10,color:"#6b7280",letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>{caso.materia} · {caso.expediente||"Sin exp."}</div><div style={{fontSize:14,fontWeight:600,color:"#f1f5f9"}}>{caso.demandante} <span style={{color:"#6b7280",fontWeight:400}}>vs</span> {caso.demandado}</div>{abogado&&<div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{abogado.name}</div>}</div>
      <span style={{background:SC[semColor]+"33",color:SC[semColor],fontSize:9,fontWeight:700,letterSpacing:1.5,padding:"3px 9px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{SL[semColor]}</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:9,color:"#6b7280",letterSpacing:1,textTransform:"uppercase"}}>Tiempo restante</span><span style={{fontSize:11,fontWeight:700,color:SC[semColor]}}>{diasRest!==null?`${diasRest}d`:"—"}</span></div><BarProg pct={pctRest} color={semColor}/><div style={{fontSize:9,color:"#6b7280",marginTop:3}}>{fmtDate(caso.fechaLimite)}</div></div>
      <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:9,color:"#6b7280",letterSpacing:1,textTransform:"uppercase"}}>En proceso</span><span style={{fontSize:11,fontWeight:700,color:SC[procColor]}}>{diasProc!==null?`${diasProc}d`:"—"}</span></div><BarProg pct={pctProc} color={procColor}/><div style={{fontSize:9,color:SC[procColor],marginTop:3}}>{PROC_LABEL[procColor]}</div></div>
    </div>
    {!caso.docsCompletos&&<div style={{marginTop:8,fontSize:10,color:"#ea580c",display:"flex",alignItems:"center",gap:4}}>⚠ Documentación incompleta</div>}
  </div>);
}

// ─── DASHBOARD NOTARIA ────────────────────────────────────────────────────────
function DashboardNotaria({docs}){
  const byTipo={};docs.forEach(d=>{byTipo[d.tipo]=(byTipo[d.tipo]||0)+1;});
  const byEstado={};docs.forEach(d=>{byEstado[d.estado]=(byEstado[d.estado]||0)+1;});
  const EC={"En proceso":"#ca8a04","Firmado":"#2563eb","Protocolizado":"#7c3aed","Entregado":"#16a34a","Archivado":"#6b7280"};
  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Dashboard — Notaría</div><div style={S.pageSubtitle}>Resumen de instrumentos notariales</div></div></div>
    <div style={{...S.statGrid,gridTemplateColumns:"repeat(3,1fr)"}}>
      <div style={S.statCard("#B8960C")}><div style={{...S.statNum,color:"#B8960C"}}>{docs.length}</div><div style={S.statLabel}>Total instrumentos</div></div>
      <div style={S.statCard("#ca8a04")}><div style={{...S.statNum,color:"#ca8a04"}}>{docs.filter(d=>d.estado==="En proceso").length}</div><div style={S.statLabel}>En proceso</div></div>
      <div style={S.statCard("#16a34a")}><div style={{...S.statNum,color:"#16a34a"}}>{docs.filter(d=>d.estado==="Entregado").length}</div><div style={S.statLabel}>Entregados</div></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div style={S.card}><div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:12}}>Por tipo</div>{Object.entries(byTipo).map(([t,n])=>(<div key={t} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #B8960C11",fontSize:13}}><span style={{color:"#d1d5db"}}>{t}</span><span style={{color:"#B8960C",fontWeight:700}}>{n}</span></div>))}{Object.keys(byTipo).length===0&&<div style={{fontSize:13,color:"#6b7280"}}>Sin instrumentos.</div>}</div>
      <div style={S.card}><div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:12}}>Por estado</div>{Object.entries(byEstado).map(([e,n])=>(<div key={e} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #B8960C11",fontSize:13}}><span style={{display:"flex",alignItems:"center",gap:5}}><span style={S.semDot(EC[e]||"#6b7280")}/>{e}</span><span style={{color:"#B8960C",fontWeight:700}}>{n}</span></div>))}{Object.keys(byEstado).length===0&&<div style={{fontSize:13,color:"#6b7280"}}>Sin instrumentos.</div>}</div>
    </div>
  </div>);
}

// ─── CASE FORM MODAL ──────────────────────────────────────────────────────────
function CaseModal({caso,users,clientes,onSave,onClose}){
  const abogados=users.filter(u=>u.role==="abogado"||u.role==="superuser");
  const empty={id:null,expediente:"",carpeta:"",sentencia:"",materia:"Penal",estado:"Activo",demandante:"",demandado:"",clienteId:"",telCliente:"",emailCliente:"",abogadoId:abogados[0]?.id||"",fechaInicio:new Date().toISOString().slice(0,10),fechaLimite:"",notas:"",docs:{},pdfs:[],log:[],notas_equipo:[],honorarios:{monto:0,pagado:0,pagos:[]},docsCompletos:false};
  const [f,setF]=useState(caso?{...caso,log:caso.log||[],notas_equipo:caso.notas_equipo||[],honorarios:caso.honorarios||{monto:0,pagado:0,pagos:[]}}:empty);
  const [tab,setTab]=useState("datos");
  function set(k,v){setF(p=>({...p,[k]:v}));}
  function save(){
    if(!f.demandante||!f.demandado||!f.materia){alert("Completa los campos obligatorios.");return;}
    const items=DOC_CHECKLIST[f.materia]||DOC_CHECKLIST.Otro;
    const completos=items.every(i=>f.docs[i]);
    const entry={id:uid(),tipo:"Sistema",texto:caso?"Caso actualizado":"Caso creado",fecha:new Date().toISOString()};
    onSave({...f,id:f.id||uid(),docsCompletos:completos,log:[...(f.log||[]),entry]});
  }
  // Auto-fill from cliente
  function selectCliente(clienteId){
    const cl=clientes.find(c=>c.id===clienteId);
    if(cl)setF(p=>({...p,clienteId,demandante:cl.nombre,telCliente:cl.tel||p.telCliente,emailCliente:cl.email||p.emailCliente}));
    else setF(p=>({...p,clienteId}));
  }
  const tabs=[["datos","Datos"],["docs","Documentos"],["honor","Honorarios"],["bitacora","Bitácora"],["notas","Notas"],["pdfs","Archivos"]];
  const tabSt=(a)=>({padding:"8px 14px",fontSize:10,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",color:a?"#B8960C":"#6b7280",borderBottom:a?"2px solid #B8960C":"2px solid transparent",background:"transparent",border:"none",fontFamily:"inherit",whiteSpace:"nowrap"});
  return(<div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={S.modal}>
      <div style={S.modalTitle}>{caso?"Editar expediente":"Nuevo expediente"}</div>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #B8960C22",marginBottom:18,overflowX:"auto"}}>
        {tabs.map(([k,l])=><button key={k} style={tabSt(tab===k)} onClick={()=>setTab(k)}>{l}</button>)}
      </div>
      {tab==="datos"&&<div>
        <div style={S.formRow}>
          <div><label style={S.label}>Expediente</label><input style={S.input} value={f.expediente} onChange={e=>set("expediente",e.target.value)}/></div>
          <div><label style={S.label}>Materia *</label><select style={S.select} value={f.materia} onChange={e=>set("materia",e.target.value)}>{MATERIAS.map(m=><option key={m}>{m}</option>)}</select></div>
        </div>
        <div style={S.formGroup}><label style={S.label}>Cliente del directorio</label><select style={S.select} value={f.clienteId||""} onChange={e=>selectCliente(e.target.value)}><option value="">— Seleccionar cliente —</option>{clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        <div style={S.formRow}>
          <div><label style={S.label}>Demandante *</label><input style={S.input} value={f.demandante} onChange={e=>set("demandante",e.target.value)}/></div>
          <div><label style={S.label}>Demandado *</label><input style={S.input} value={f.demandado} onChange={e=>set("demandado",e.target.value)}/></div>
        </div>
        <div style={S.formRow}>
          <div><label style={S.label}>Carpeta</label><input style={S.input} value={f.carpeta} onChange={e=>set("carpeta",e.target.value)}/></div>
          <div><label style={S.label}>Sentencia</label><input style={S.input} value={f.sentencia} onChange={e=>set("sentencia",e.target.value)}/></div>
        </div>
        <div style={S.formRow}>
          <div><label style={S.label}>Tel. cliente</label><input style={S.input} value={f.telCliente||""} onChange={e=>set("telCliente",e.target.value)}/></div>
          <div><label style={S.label}>Email cliente</label><input style={S.input} value={f.emailCliente||""} onChange={e=>set("emailCliente",e.target.value)}/></div>
        </div>
        <div style={S.formRow}>
          <div><label style={S.label}>Fecha inicio</label><input type="date" style={S.input} value={f.fechaInicio} onChange={e=>set("fechaInicio",e.target.value)}/></div>
          <div><label style={S.label}>Fecha límite</label><input type="date" style={S.input} value={f.fechaLimite} onChange={e=>set("fechaLimite",e.target.value)}/></div>
        </div>
        <div style={S.formRow}>
          <div><label style={S.label}>Abogado asignado</label><select style={S.select} value={f.abogadoId} onChange={e=>set("abogadoId",e.target.value)}>{abogados.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><label style={S.label}>Estado</label><select style={S.select} value={f.estado} onChange={e=>set("estado",e.target.value)}>{["Activo","En espera","Cerrado","Archivado"].map(s=><option key={s}>{s}</option>)}</select></div>
        </div>
        <div><label style={S.label}>Notas generales</label><textarea style={S.textarea} value={f.notas} onChange={e=>set("notas",e.target.value)}/></div>
      </div>}
      {tab==="docs"&&<Checklist materia={f.materia} checked={f.docs} onChange={v=>set("docs",v)} pdfsByDoc={f.docsPdfs||{}} onPdfChange={v=>set("docsPdfs",v)}/>}
      {tab==="honor"&&<HonorariosMini honorarios={f.honorarios} onUpdate={v=>set("honorarios",v)}/>}
      {tab==="bitacora"&&<Bitacora log={f.log} onAdd={entry=>set("log",[...(f.log||[]),entry])}/>}
      {tab==="notas"&&<NotasRapidas notas={f.notas_equipo} currentUser={{name:"Usuario"}} onAdd={n=>set("notas_equipo",[...(f.notas_equipo||[]),n])}/>}
      {tab==="pdfs"&&<PdfAttach pdfs={f.pdfs||[]} onChange={v=>set("pdfs",v)}/>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20,paddingTop:16,borderTop:"1px solid #B8960C22"}}>
        <button style={{...S.btn,...S.btnGhost}} onClick={onClose}>Cancelar</button>
        <button style={{...S.btn,...S.btnPrimary}} onClick={save}>Guardar expediente</button>
      </div>
    </div>
  </div>);
}

// ─── CASE DETAIL MODAL ────────────────────────────────────────────────────────
// ─── QR DE EXPEDIENTE ─────────────────────────────────────────────────────────
function expedienteURL(caso){
  const base=window.location.origin+"/app";
  return `${base}?exp=${caso.id}`;
}
function ExpedienteQR({caso}){
  const url=expedienteURL(caso);
  const qrImgSrc=`https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&color=15-23-42&bgcolor=255-255-255&data=${encodeURIComponent(url)}`;
  function imprimir(){
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>QR — ${caso.expediente}</title><style>
      body{font-family:Arial,sans-serif;text-align:center;padding:40px;}
      h2{color:#0D0D0D;margin-bottom:4px;}
      p{color:#6b7280;margin-top:0;}
      img{margin:20px 0;}
    </style></head><body>
      <h2>REYCO — ${caso.expediente||"Expediente"}</h2>
      <p>${caso.demandante} vs ${caso.demandado}</p>
      <img src="${qrImgSrc}" width="280" height="280"/>
      <p style="font-size:11px;">Escanee para abrir este expediente en la app REYCO</p>
    </body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),400);
  }
  return(<div style={{textAlign:"center",padding:"10px 0"}}>
    <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:14}}>Código QR del expediente</div>
    <div style={{background:"#fff",display:"inline-block",padding:14,borderRadius:4}}>
      <img src={qrImgSrc} alt="QR expediente" width={220} height={220} style={{display:"block"}}/>
    </div>
    <div style={{fontSize:12,color:"#9ca3af",marginTop:14,maxWidth:320,marginLeft:"auto",marginRight:"auto"}}>
      Al escanear este código desde la app móvil REYCO (o cualquier lector de QR), se abrirá directamente este expediente tras iniciar sesión.
    </div>
    <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:16}}>
      <button style={{...S.btn,...S.btnPrimary}} onClick={imprimir}>🖨 Imprimir</button>
      <button style={{...S.btn,...S.btnGhost}} onClick={()=>{navigator.clipboard?.writeText(url);alert("Enlace copiado");}}>Copiar enlace</button>
    </div>
  </div>);
}

function CaseDetail({caso,users,cfg,onEdit,onClose,onEnviarEncuesta,currentUser,defaultTab}){
  const abogado=users.find(u=>u.id===caso.abogadoId);
  const color=semaforo(caso.fechaLimite,caso.docsCompletos,cfg);
  const items=DOC_CHECKLIST[caso.materia]||DOC_CHECKLIST.Otro;
  const cerrado=caso.estado==="Cerrado"||caso.estado==="Archivado";
  const [tab,setTab]=useState(defaultTab||"info");
  const docsPdfs=caso.docsPdfs||{};
  const tabSt=(a)=>({padding:"8px 14px",fontSize:10,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",color:a?"#B8960C":"#6b7280",borderBottom:a?"2px solid #B8960C":"2px solid transparent",background:"transparent",border:"none",fontFamily:"inherit"});
  return(<div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={S.modal}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,borderBottom:"1px solid #B8960C22",paddingBottom:14}}>
        <div><div style={{fontSize:10,letterSpacing:3,color:"#B8960C",textTransform:"uppercase"}}>{caso.materia} · {caso.expediente}</div><div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:700,color:"#f1f5f9",marginTop:4}}>{caso.demandante} <span style={{color:"#6b7280",fontSize:15}}>vs</span> {caso.demandado}</div></div>
        <span style={{...S.semDot(SC[color]),width:12,height:12,marginTop:6}}/>
      </div>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #B8960C22",marginBottom:16,overflowX:"auto"}}>
        {[["info","Información"],["bitacora","Bitácora"],["notas","Notas"],["honor","Honorarios"],["qr","Código QR"]].map(([k,l])=><button key={k} style={tabSt(tab===k)} onClick={()=>setTab(k)}>{l}</button>)}
      </div>
      {tab==="info"&&<div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[["Carpeta",caso.carpeta],["Sentencia",caso.sentencia],["Abogado",abogado?.name],["Estado",caso.estado],["Fecha inicio",fmtDate(caso.fechaInicio)],["Fecha límite",fmtDate(caso.fechaLimite)]].map(([k,v])=>(<div key={k} style={S.infoBox}><div style={{fontSize:9,letterSpacing:2,color:"#6b7280",textTransform:"uppercase"}}>{k}</div><div style={{fontSize:13,color:"#d1d5db",marginTop:3}}>{v||"—"}</div></div>))}
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,letterSpacing:2,color:"#B8960C",textTransform:"uppercase",marginBottom:8}}>Documentación</div>
          {items.map(item=>{
            const pdf=docsPdfs[item];
            return(<div key={item} style={{marginBottom:8,paddingBottom:8,borderBottom:"1px solid #B8960C11"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,fontSize:13,color:caso.docs?.[item]?"#86efac":"#f87171"}}><span>{caso.docs?.[item]?"✓":"✗"}</span>{item}</div>
              {pdf&&<div style={{marginLeft:20,marginTop:4,fontSize:12,color:"#d1d5db"}}>📄 <a href={pdf.data} download={pdf.name} style={{color:"#B8960C"}}>{pdf.name}</a></div>}
            </div>);
          })}
        </div>
        {cerrado&&<div style={{background:"#16a34a11",border:"1px solid #16a34a33",padding:"14px 16px",marginTop:14}}><div style={{fontSize:11,color:"#86efac",marginBottom:6,letterSpacing:1}}>CASO CONCLUIDO</div><div style={{fontSize:12,color:"#9ca3af",marginBottom:10}}>Envíe una encuesta de satisfacción al cliente.</div><button style={{...S.btn,...S.btnGreen}} onClick={onEnviarEncuesta}>📋 Enviar encuesta</button></div>}
      </div>}
      {tab==="bitacora"&&<Bitacora log={caso.log} onAdd={()=>{}}/>}
      {tab==="notas"&&<NotasRapidas notas={caso.notas_equipo||[]} currentUser={currentUser} onAdd={()=>{}}/>}
      {tab==="honor"&&<HonorariosMini honorarios={caso.honorarios||{monto:0,pagado:0,pagos:[]}} onUpdate={()=>{}}/>}
      {tab==="qr"&&<ExpedienteQR caso={caso}/>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16,paddingTop:14,borderTop:"1px solid #B8960C22"}}>
        <button style={{...S.btn,...S.btnGhost}} onClick={onClose}>Cerrar</button>
        <button style={{...S.btn,...S.btnPrimary}} onClick={onEdit}>Editar</button>
      </div>
    </div>
  </div>);
}

// ─── NOTARIA FORM ─────────────────────────────────────────────────────────────
function NotariaModal({doc,onSave,onClose}){
  const empty={id:null,tipo:"Escritura pública",instrumento:"",notario:"",parte1:"",parte2:"",fecha:new Date().toISOString().slice(0,10),estado:"En proceso",notas:"",pdfs:[],log:[]};
  const [f,setF]=useState(doc?{...doc}:empty);
  function set(k,v){setF(p=>({...p,[k]:v}));}
  function save(){if(!f.instrumento||!f.tipo){alert("Completa los campos.");return;}const entry={id:uid(),tipo:"Sistema",texto:doc?"Actualizado":"Creado",fecha:new Date().toISOString()};onSave({...f,id:f.id||uid(),log:[...(f.log||[]),entry]});}
  return(<div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={S.modalSm}>
      <div style={S.modalTitle}>{f.id?"Editar instrumento":"Nuevo instrumento notarial"}</div>
      <div style={S.formRow}><div><label style={S.label}>Tipo *</label><select style={S.select} value={f.tipo} onChange={e=>set("tipo",e.target.value)}>{TIPO_NOTARIA.map(t=><option key={t}>{t}</option>)}</select></div><div><label style={S.label}>Núm. instrumento *</label><input style={S.input} value={f.instrumento} onChange={e=>set("instrumento",e.target.value)}/></div></div>
      <div style={S.formRow}><div><label style={S.label}>Parte 1</label><input style={S.input} value={f.parte1} onChange={e=>set("parte1",e.target.value)}/></div><div><label style={S.label}>Parte 2</label><input style={S.input} value={f.parte2} onChange={e=>set("parte2",e.target.value)}/></div></div>
      <div style={S.formRow}><div><label style={S.label}>Notario</label><input style={S.input} value={f.notario} onChange={e=>set("notario",e.target.value)}/></div><div><label style={S.label}>Fecha</label><input type="date" style={S.input} value={f.fecha} onChange={e=>set("fecha",e.target.value)}/></div></div>
      <div style={{marginBottom:12}}><label style={S.label}>Estado</label><select style={S.select} value={f.estado} onChange={e=>set("estado",e.target.value)}>{["En proceso","Firmado","Protocolizado","Entregado","Archivado"].map(s=><option key={s}>{s}</option>)}</select></div>
      <div style={{marginBottom:12}}><label style={S.label}>Notas</label><textarea style={S.textarea} value={f.notas} onChange={e=>set("notas",e.target.value)}/></div>
      <div style={{marginBottom:18}}><PdfAttach pdfs={f.pdfs||[]} onChange={v=>set("pdfs",v)}/></div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button style={{...S.btn,...S.btnGhost}} onClick={onClose}>Cancelar</button><button style={{...S.btn,...S.btnPrimary}} onClick={save}>Guardar</button></div>
    </div>
  </div>);
}

// ─── CASES LIST ───────────────────────────────────────────────────────────────
function CasesList({cases,users,clientes,cfg,currentUser,onUpdate,openExpedienteId,onOpened}){
  const [modal,setModal]=useState(null);
  const [detail,setDetail]=useState(null);
  const [detailFromQR,setDetailFromQR]=useState(false);
  const [encModal,setEncModal]=useState(null);
  const [search,setSearch]=useState("");
  const [filterMateria,setFilterMateria]=useState("");
  const [filterEstado,setFilterEstado]=useState("");
  const visible=cases
    .filter(c=>currentUser.role==="superuser"||c.abogadoId===currentUser.id)
    .filter(c=>!search||c.demandante?.toLowerCase().includes(search.toLowerCase())||c.demandado?.toLowerCase().includes(search.toLowerCase())||c.expediente?.toLowerCase().includes(search.toLowerCase()))
    .filter(c=>!filterMateria||c.materia===filterMateria)
    .filter(c=>!filterEstado||c.estado===filterEstado)
    .sort((a,b)=>{const ord={red:0,orange:1,yellow:2,gray:3,green:4};return ord[semaforo(a.fechaLimite,a.docsCompletos,cfg)]-ord[semaforo(b.fechaLimite,b.docsCompletos,cfg)];});

  // Si llegamos desde un QR escaneado, abre ese expediente automáticamente en la pestaña Bitácora
  useEffect(()=>{
    if(openExpedienteId){
      const found=cases.find(c=>c.id===openExpedienteId);
      if(found){ setDetail(found); setDetailFromQR(true); onOpened&&onOpened(); }
    }
  },[openExpedienteId,cases]);

  function saveCase(c){const u=cases.find(x=>x.id===c.id)?cases.map(x=>x.id===c.id?c:x):[...cases,c];onUpdate(u);setModal(null);setDetail(null);}
  function deleteCase(id){if(!confirm("¿Eliminar?"))return;onUpdate(cases.filter(c=>c.id!==id));}
  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Expedientes</div><div style={S.pageSubtitle}>{visible.length} caso{visible.length!==1?"s":""}</div></div><button style={{...S.btn,...S.btnPrimary}} onClick={()=>setModal({})}>+ Nuevo expediente</button></div>
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
      <input style={{...S.input,width:200}} placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <select style={{...S.select,width:150}} value={filterMateria} onChange={e=>setFilterMateria(e.target.value)}><option value="">Todas las materias</option>{MATERIAS.map(m=><option key={m}>{m}</option>)}</select>
      <select style={{...S.select,width:150}} value={filterEstado} onChange={e=>setFilterEstado(e.target.value)}><option value="">Todos los estados</option>{["Activo","En espera","Cerrado","Archivado"].map(s=><option key={s}>{s}</option>)}</select>
    </div>
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Semáforo</th><th style={S.th}>Expediente</th><th style={S.th}>Demandante</th><th style={S.th}>Demandado</th><th style={S.th}>Materia</th><th style={S.th}>Vence</th><th style={S.th}>Estado</th><th style={S.th}>Acciones</th></tr></thead>
        <tbody>
          {visible.length===0&&<tr><td colSpan={8} style={{...S.td,textAlign:"center",color:"#6b7280",padding:28}}>Sin expedientes.</td></tr>}
          {visible.map(c=>{
            const sc=semaforo(c.fechaLimite,c.docsCompletos,cfg);
            const cerrado=c.estado==="Cerrado"||c.estado==="Archivado";
            return(<tr key={c.id} style={{cursor:"pointer",background:SEM_BG[sc]}} onClick={()=>setDetail(c)}>
              <td style={S.td}><div style={{display:"flex",alignItems:"center",gap:5}}><SemDot color={sc}/><span style={{fontSize:11,color:SC[sc]}}>{diasRestantes(c.fechaLimite)!==null?`${diasRestantes(c.fechaLimite)}d`:"—"}</span></div></td>
              <td style={{...S.td,color:"#f1f5f9",fontWeight:600}}>{c.expediente||"—"}</td>
              <td style={S.td}>{c.demandante}</td>
              <td style={S.td}>{c.demandado}</td>
              <td style={S.td}><Chip label={c.materia}/></td>
              <td style={{...S.td,color:SC[sc]}}>{fmtDate(c.fechaLimite)}</td>
              <td style={S.td}>{c.estado}</td>
              <td style={S.td} onClick={e=>e.stopPropagation()}><div style={{display:"flex",gap:5}}>
                {cerrado&&<button style={{...S.btn,...S.btnGreen,padding:"4px 8px",fontSize:10}} onClick={()=>setEncModal(c)} title="Encuesta">📋</button>}
                <button style={{...S.btn,...S.btnGhost,padding:"4px 8px",fontSize:10}} onClick={()=>setModal(c)}>Editar</button>
                <button style={{...S.btn,...S.btnDanger,padding:"4px 8px",fontSize:10}} onClick={()=>deleteCase(c.id)}>✕</button>
              </div></td>
            </tr>);
          })}
        </tbody>
      </table>
    </div>
    {modal!==null&&<CaseModal caso={modal?.id?modal:null} users={users} clientes={clientes} onSave={saveCase} onClose={()=>setModal(null)}/>}
    {detail&&<CaseDetail caso={detail} users={users} cfg={cfg} currentUser={currentUser} defaultTab={detailFromQR?"bitacora":"info"} onEdit={()=>{setModal(detail);setDetail(null);setDetailFromQR(false);}} onClose={()=>{setDetail(null);setDetailFromQR(false);}} onEnviarEncuesta={()=>{setEncModal(detail);setDetail(null);setDetailFromQR(false);}}/>}
    {encModal&&<EnviarEncuestaModal caso={encModal} onClose={()=>setEncModal(null)}/>}
  </div>);
}

// ─── NOTARIA LIST ─────────────────────────────────────────────────────────────
function NotariaList({docs,onUpdate}){
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [filterTipo,setFilterTipo]=useState("");
  const EC={"En proceso":"#ca8a04","Firmado":"#2563eb","Protocolizado":"#7c3aed","Entregado":"#16a34a","Archivado":"#6b7280"};
  const visible=docs.filter(d=>!search||d.instrumento?.includes(search)||d.parte1?.toLowerCase().includes(search.toLowerCase())||d.parte2?.toLowerCase().includes(search.toLowerCase())).filter(d=>!filterTipo||d.tipo===filterTipo);
  function saveDoc(d){const u=docs.find(x=>x.id===d.id)?docs.map(x=>x.id===d.id?d:x):[...docs,d];onUpdate(u);setModal(null);}
  function deleteDoc(id){if(!confirm("¿Eliminar?"))return;onUpdate(docs.filter(d=>d.id!==id));}
  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Instrumentos Notariales</div><div style={S.pageSubtitle}>{visible.length} instrumento{visible.length!==1?"s":""}</div></div><button style={{...S.btn,...S.btnPrimary}} onClick={()=>setModal({})}>+ Nuevo instrumento</button></div>
    <div style={{display:"flex",gap:10,marginBottom:16}}>
      <input style={{...S.input,width:200}} placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <select style={{...S.select,width:200}} value={filterTipo} onChange={e=>setFilterTipo(e.target.value)}><option value="">Todos los tipos</option>{TIPO_NOTARIA.map(t=><option key={t}>{t}</option>)}</select>
    </div>
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Instrumento</th><th style={S.th}>Tipo</th><th style={S.th}>Parte 1</th><th style={S.th}>Parte 2</th><th style={S.th}>Fecha</th><th style={S.th}>Estado</th><th style={S.th}>Acciones</th></tr></thead>
        <tbody>
          {visible.length===0&&<tr><td colSpan={7} style={{...S.td,textAlign:"center",color:"#6b7280",padding:28}}>Sin instrumentos.</td></tr>}
          {visible.map(d=>(<tr key={d.id}><td style={{...S.td,color:"#f1f5f9",fontWeight:600}}>{d.instrumento}</td><td style={S.td}><Chip label={d.tipo}/></td><td style={S.td}>{d.parte1||"—"}</td><td style={S.td}>{d.parte2||"—"}</td><td style={S.td}>{fmtDate(d.fecha)}</td><td style={S.td}><span style={S.semDot(EC[d.estado]||"#6b7280")}/>{d.estado}</td><td style={S.td}><div style={{display:"flex",gap:5}}><button style={{...S.btn,...S.btnGhost,padding:"4px 8px",fontSize:10}} onClick={()=>setModal(d)}>Editar</button><button style={{...S.btn,...S.btnDanger,padding:"4px 8px",fontSize:10}} onClick={()=>deleteDoc(d.id)}>✕</button></div></td></tr>))}
        </tbody>
      </table>
    </div>
    {modal!==null&&<NotariaModal doc={modal?.id?modal:null} onSave={saveDoc} onClose={()=>setModal(null)}/>}
  </div>);
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function Settings({cfg,users,onSaveCfg,onSaveUsers}){
  const [c,setC]=useState({...cfg});
  const [us,setUs]=useState([...users]);
  const [newU,setNewU]=useState({name:"",username:"",password:"",role:"abogado"});
  function addUser(){if(!newU.name||!newU.username||!newU.password){alert("Completa todos los campos.");return;}const updated=[...us,{...newU,id:uid()}];setUs(updated);onSaveUsers(updated);setNewU({name:"",username:"",password:"",role:"abogado"});}
  function delUser(id){if(!confirm("¿Eliminar usuario?"))return;const updated=us.filter(u=>u.id!==id);setUs(updated);onSaveUsers(updated);}
  return(<div>
    <div style={S.pageHeader}><div><div style={S.pageTitle}>Configuración</div><div style={S.pageSubtitle}>Semáforo y usuarios del sistema</div></div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
      <div style={S.card}>
        <div style={{fontSize:12,fontWeight:600,color:"#f1f5f9",marginBottom:18,letterSpacing:1}}>SEMÁFORO DE VENCIMIENTO</div>
        <div style={{marginBottom:14}}><label style={S.label}>🟡 Alerta amarilla (días antes)</label><input type="number" style={S.input} value={c.amarillo} onChange={e=>setC(p=>({...p,amarillo:+e.target.value}))}/></div>
        <div style={{marginBottom:18}}><label style={S.label}>🔴 Alerta roja (días antes)</label><input type="number" style={S.input} value={c.rojo} onChange={e=>setC(p=>({...p,rojo:+e.target.value}))}/></div>
        <button style={{...S.btn,...S.btnPrimary}} onClick={()=>onSaveCfg(c)}>Guardar configuración</button>
      </div>
      <div style={S.card}>
        <div style={{fontSize:12,fontWeight:600,color:"#f1f5f9",marginBottom:16,letterSpacing:1}}>USUARIOS</div>
        {us.map(u=>(<div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #B8960C11",fontSize:12}}>
          <div><span style={{color:"#f1f5f9"}}>{u.name}</span><span style={{color:"#6b7280",marginLeft:8}}>@{u.username}</span></div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}><Chip label={u.role}/><button style={{...S.btn,...S.btnDanger,padding:"2px 7px",fontSize:10}} onClick={()=>delUser(u.id)}>✕</button></div>
        </div>))}
        <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid #B8960C22"}}>
          <div style={{fontSize:10,color:"#B8960C",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Agregar usuario</div>
          <input style={{...S.input,marginBottom:7}} placeholder="Nombre completo" value={newU.name} onChange={e=>setNewU(p=>({...p,name:e.target.value}))}/>
          <input style={{...S.input,marginBottom:7}} placeholder="Usuario" value={newU.username} onChange={e=>setNewU(p=>({...p,username:e.target.value}))}/>
          <input style={{...S.input,marginBottom:7}} placeholder="Contraseña" value={newU.password} onChange={e=>setNewU(p=>({...p,password:e.target.value}))}/>
          <select style={{...S.select,marginBottom:10}} value={newU.role} onChange={e=>setNewU(p=>({...p,role:e.target.value}))}><option value="abogado">Abogado</option><option value="notaria">Notaría</option><option value="superuser">Superusuario</option></select>
          <button style={{...S.btn,...S.btnPrimary,width:"100%"}} onClick={addUser}>Agregar usuario</button>
        </div>
      </div>
    </div>
  </div>);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const [u,setU]=useState("");const [p,setP]=useState("");const [err,setErr]=useState("");
  function doLogin(){const users=dbGet(KEYS.users)||DEFAULT_USERS;const found=users.find(x=>x.username===u&&x.password===p);if(found)onLogin(found);else setErr("Usuario o contraseña incorrectos");}
  return(<div style={S.loginWrap}><div style={S.loginBox}>
    <div style={S.loginLogo}>REYCO</div><div style={S.loginSub}>Sistema de Gestión</div>
    <div style={{marginTop:8}}>
      <label style={S.loginLabel}>Usuario</label>
      <input style={S.loginInput} value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
      <label style={S.loginLabel}>Contraseña</label>
      <input style={S.loginInput} type="password" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
      {err&&<div style={S.loginErr}>{err}</div>}
      <button style={{...S.loginBtn,marginTop:8}} onClick={doLogin}>Ingresar</button>
    </div>
    <div style={{marginTop:20,fontSize:11,color:"#374151"}}>Bufete REYCO · Puebla, México</div>
  </div></div>);
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null);
  const [page,setPage]=useState("dashboard");
  const [activeModule,setActiveModule]=useState("bufete");
  const [cases,setCases]=useState([]);
  const [notariaDocs,setNotariaDocs]=useState([]);
  const [users,setUsers]=useState(DEFAULT_USERS);
  const [cfg,setCfg]=useState(DEFAULT_CFG);
  const [testimoniales,setTestimoniales]=useState([]);
  const [clientes,setClientes]=useState([]);
  const [agenda,setAgenda]=useState([]);
  const [encuestaToken,setEncuestaToken]=useState(null);
  const [pendingExpediente,setPendingExpediente]=useState(null);
  const [showNotif,setShowNotif]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const t=params.get("encuesta");if(t)setEncuestaToken(t);
    const exp=params.get("exp");if(exp)setPendingExpediente(exp);

    // 1. Carga instantánea desde caché local (para que la UI no se vea vacía)
    const c=dbGet(KEYS.cases);if(c)setCases(c);
    const n=dbGet(KEYS.notaria);if(n)setNotariaDocs(n);
    const u=dbGet(KEYS.users);if(u)setUsers(u);
    const s=dbGet(KEYS.settings);if(s)setCfg(s);
    const test=dbGet(KEYS.testimoniales);if(test)setTestimoniales(test);
    const cl=dbGet(KEYS.clientes);if(cl)setClientes(cl);
    const ag=dbGet(KEYS.agenda);if(ag)setAgenda(ag);

    // 2. Suscripción en tiempo real a Firestore: cuando cambia en cualquier
    //    dispositivo (computadora, celular), se actualiza aquí también.
    const unsubs = [
      dbSubscribe(KEYS.cases, (v)=>{ setCases(v); dbSetLocal(KEYS.cases, v); }),
      dbSubscribe(KEYS.notaria, (v)=>{ setNotariaDocs(v); dbSetLocal(KEYS.notaria, v); }),
      dbSubscribe(KEYS.users, (v)=>{ setUsers(v); dbSetLocal(KEYS.users, v); }),
      dbSubscribe(KEYS.settings, (v)=>{ setCfg(v); dbSetLocal(KEYS.settings, v); }),
      dbSubscribe(KEYS.testimoniales, (v)=>{ setTestimoniales(v); dbSetLocal(KEYS.testimoniales, v); }),
      dbSubscribe(KEYS.clientes, (v)=>{ setClientes(v); dbSetLocal(KEYS.clientes, v); }),
      dbSubscribe(KEYS.agenda, (v)=>{ setAgenda(v); dbSetLocal(KEYS.agenda, v); }),
    ];
    return ()=>{ unsubs.forEach(u=>u && u()); };
  },[]);

  const saveCases=useCallback((d)=>{setCases(d);dbSet(KEYS.cases,d);},[]);
  const saveNotaria=useCallback((d)=>{setNotariaDocs(d);dbSet(KEYS.notaria,d);},[]);
  const saveUsers=useCallback((d)=>{setUsers(d);dbSet(KEYS.users,d);},[]);
  const saveCfg=useCallback((d)=>{setCfg(d);dbSet(KEYS.settings,d);},[]);
  const saveTestimoniales=useCallback((d)=>{setTestimoniales(d);dbSet(KEYS.testimoniales,d);},[]);
  const saveClientes=useCallback((d)=>{setClientes(d);dbSet(KEYS.clientes,d);},[]);
  const saveAgenda=useCallback((d)=>{setAgenda(d);dbSet(KEYS.agenda,d);},[]);

  // Si venimos de escanear un QR de expediente, navega directo a Expedientes
  useEffect(()=>{
    if(pendingExpediente && page!=="cases") setPage("cases");
  },[pendingExpediente]);

  if(encuestaToken)return<EncuestaPublica token={encuestaToken} onSubmit={r=>saveTestimoniales([...testimoniales,r])}/>;
  if(!user)return<Login onLogin={u=>{setUser(u);setPage("dashboard");setActiveModule(u.role==="notaria"?"notaria":"bufete");}}/>;

  const isSuper=user.role==="superuser";
  const isNotaria=user.role==="notaria";
  const module=isNotaria?"notaria":activeModule;

  // Badge counts
  const pendTest=testimoniales.filter(t=>!t.aprobado&&!t.rechazado).length;
  const urgentes=cases.filter(c=>semaforo(c.fechaLimite,c.docsCompletos,cfg)==="red"&&c.estado==="Activo").length;
  const prox3=agenda.filter(a=>{const d=diasRestantes(a.fecha);return d!==null&&d>=0&&d<=3;}).length;
  const totalNotif=urgentes+pendTest+prox3;

  function renderPage(){
    if(page==="settings")return<Settings cfg={cfg} users={users} onSaveCfg={saveCfg} onSaveUsers={saveUsers}/>;
    if(page==="testimoniales")return<TestimonialesAdmin testimoniales={testimoniales} onUpdate={saveTestimoniales}/>;
    if(page==="clientes")return<Clientes clientes={clientes} cases={cases} onUpdate={saveClientes}/>;
    if(page==="agenda")return<Agenda agenda={agenda} cases={cases} users={users} currentUser={user} onUpdate={saveAgenda}/>;
    if(page==="bitacoraGeneral")return<BitacoraGeneral cases={isSuper?cases:cases.filter(c=>c.abogadoId===user.id)} users={users}/>;
    if(page==="reportes")return<Reportes cases={cases} clientes={clientes} agenda={agenda} testimoniales={testimoniales} cfg={cfg}/>;
    if(module==="notaria"){
      if(page==="dashboard")return<DashboardNotaria docs={notariaDocs}/>;
      return<NotariaList docs={notariaDocs} onUpdate={saveNotaria}/>;
    }
    if(page==="dashboard")return<DashboardBufete cases={cases} users={users} cfg={cfg} testimoniales={testimoniales} agenda={agenda} clientes={clientes}/>;
    return<CasesList cases={cases} users={users} clientes={clientes} cfg={cfg} currentUser={user} onUpdate={saveCases} openExpedienteId={pendingExpediente} onOpened={()=>setPendingExpediente(null)}/>;
  }

  const navBufete=[
    {id:"dashboard",label:"Dashboard",icon:"▣"},
    {id:"cases",label:"Expedientes",icon:"📁"},
    {id:"clientes",label:"Clientes",icon:"👤"},
    {id:"agenda",label:"Agenda",icon:"📅",badge:prox3>0?prox3:0},
    {id:"bitacoraGeneral",label:"Bitácora General",icon:"📜"},
    ...(isSuper?[
      {id:"testimoniales",label:"Testimoniales",icon:"⭐",badge:pendTest},
      {id:"reportes",label:"Reportes",icon:"📊"},
      {id:"settings",label:"Configuración",icon:"⚙️"},
    ]:[]),
  ];
  const navNotaria=[
    {id:"dashboard",label:"Dashboard",icon:"▣"},
    {id:"notaria",label:"Instrumentos",icon:"📋"},
    ...(isSuper?[{id:"settings",label:"Configuración",icon:"⚙️"}]:[]),
  ];
  const currentNav=isNotaria?navNotaria:module==="notaria"?navNotaria:navBufete;

  return(<div style={S.app}>
    <div style={S.sidebar}>
      <div style={S.sidebarLogo}>
        <div style={S.sidebarLogoText}>REYCO</div>
        <div style={S.sidebarLogoSub}>{isNotaria?"Notaría":"Gestión"}</div>
      </div>
      <div style={S.sidebarUser}>
        <div style={{color:"#f1f5f9",fontWeight:600,fontSize:13}}>{user.name}</div>
        <div style={{fontSize:10,color:"#6b7280",marginTop:2,textTransform:"uppercase",letterSpacing:1}}>{user.role}</div>
      </div>
      {isSuper&&(<div style={{display:"flex",borderBottom:"1px solid #B8960C22"}}>
        <button onClick={()=>{setActiveModule("bufete");setPage("dashboard");}} style={{flex:1,padding:"9px 0",fontSize:10,letterSpacing:1,background:module==="bufete"?"#B8960C22":"transparent",color:module==="bufete"?"#B8960C":"#6b7280",border:"none",cursor:"pointer",textTransform:"uppercase",borderBottom:module==="bufete"?"2px solid #B8960C":"2px solid transparent"}}>Bufete</button>
        <button onClick={()=>{setActiveModule("notaria");setPage("dashboard");}} style={{flex:1,padding:"9px 0",fontSize:10,letterSpacing:1,background:module==="notaria"?"#B8960C22":"transparent",color:module==="notaria"?"#B8960C":"#6b7280",border:"none",cursor:"pointer",textTransform:"uppercase",borderBottom:module==="notaria"?"2px solid #B8960C":"2px solid transparent"}}>Notaría</button>
      </div>)}
      <nav style={S.sidebarNav}>
        {currentNav.map(n=>(<div key={n.id} style={S.navItem(page===n.id)} onClick={()=>setPage(n.id)}>
          <span>{n.icon}</span>
          <span style={{position:"relative",flex:1}}>{n.label}
            {n.badge>0&&<span style={{position:"absolute",top:-2,right:0,background:"#dc2626",color:"white",fontSize:9,borderRadius:"50%",width:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{n.badge}</span>}
          </span>
        </div>))}
      </nav>
      <div style={S.sidebarFooter}>
        {isSuper&&<button style={{...S.btn,...S.btnBlue,width:"100%",marginBottom:8,position:"relative"}} onClick={()=>setShowNotif(true)}>
          🔔 Notificaciones{totalNotif>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#dc2626",color:"white",fontSize:9,borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{totalNotif}</span>}
        </button>}
        <button style={{...S.btn,...S.btnGhost,width:"100%",fontSize:11}} onClick={()=>setUser(null)}>Cerrar sesión</button>
      </div>
    </div>
    <main style={S.main}>{renderPage()}</main>
    {showNotif&&<PanelNotificaciones cases={cases} agenda={agenda} testimoniales={testimoniales} cfg={cfg} onClose={()=>setShowNotif(false)}/>}
  </div>);
}
