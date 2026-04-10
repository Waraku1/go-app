import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, get, update } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "test-ig-31e35.firebaseapp.com",
  databaseURL: "https://test-ig-31e35-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-ig-31e35",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const createBoard = (size) =>
  Array.from({ length: size }, () => Array(size).fill(null));

const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

function getGroup(b,x,y,size,visited=new Set()){
  const c=b[y][x];
  const k=`${x},${y}`;
  if(visited.has(k)) return [];
  visited.add(k);
  let g=[[x,y]];
  dirs.forEach(([dx,dy])=>{
    const nx=x+dx, ny=y+dy;
    if(nx>=0&&ny>=0&&nx<size&&ny<size&&b[ny][nx]===c){
      g=g.concat(getGroup(b,nx,ny,size,visited));
    }
  });
  return g;
}

function hasLiberty(b,g,size){
  return g.some(([x,y]) =>
    dirs.some(([dx,dy])=>{
      const nx=x+dx, ny=y+dy;
      return nx>=0&&ny>=0&&nx<size&&ny<size&&b[ny][nx]===null;
    })
  );
}

const serialize = (b) => JSON.stringify(b);

export default function App(){
  const [board,setBoard]=useState([]);
  const [history,setHistory]=useState([]);
  const [turn,setTurn]=useState("black");
  const [roomId,setRoomId]=useState("");
  const [connected,setConnected]=useState(false);
  const [player,setPlayer]=useState(null);
  const [size,setSize]=useState(9);
  const [mode,setMode]=useState("pvp"); // pvp or ai

  const userId = useMemo(()=>Math.random().toString(36).slice(2,10),[]);

  useEffect(()=>{
    if(!connected||!roomId) return;

    const r=ref(db,`rooms/${roomId}`);
    const unsub=onValue(r,s=>{
      const d=s.val();
      if(!d) return;

      setBoard(d.board);
      setTurn(d.turn);
      setHistory(d.history || []);
      setSize(d.size || 9);
      setMode(d.mode || "pvp");

      if(d.players){
        if(d.players.black===userId) setPlayer("black");
        if(d.players.white===userId) setPlayer("white");
      }
    });

    return ()=>unsub();
  },[connected,roomId]);

  const connect=async()=>{
    const r=ref(db,`rooms/${roomId}`);
    const snap=await get(r);

    if(!snap.exists()){
      await set(r,{
        board:createBoard(size),
        history:[],
        turn:"black",
        size,
        mode,
        players: mode==="ai"
          ? {black:userId, white:"AI"}
          : {black:userId}
      });
      setPlayer("black");
    }else{
      const d=snap.val();
      let u={};

      if(!d.players?.black){
        u["players/black"]=userId;
        setPlayer("black");
      }else if(!d.players?.white && d.mode==="pvp"){
        u["players/white"]=userId;
        setPlayer("white");
      }
      await update(r,u);
    }

    setConnected(true);
  };

  const playMove=(b,x,y,player)=>{
    const nb=b.map(r=>[...r]);
    nb[y][x]=player;
    const opp=player==="black"?"white":"black";

    dirs.forEach(([dx,dy])=>{
      const nx=x+dx, ny=y+dy;
      if(nx>=0&&ny>=0&&nx<size&&ny<size&&nb[ny][nx]===opp){
        const g=getGroup(nb,nx,ny,size);
        if(!hasLiberty(nb,g,size)){
          g.forEach(([gx,gy])=>nb[gy][gx]=null);
        }
      }
    });

    const self=getGroup(nb,x,y,size);
    if(!hasLiberty(nb,self,size)) return null;

    return nb;
  };

  const click=(x,y)=>{
    if(turn!==player || board[y][x]) return;

    const nb = playMove(board,x,y,player);
    if(!nb) return;

    if(history.includes(serialize(nb))){
      alert("コウ禁止");
      return;
    }

    const newHistory=[...history, serialize(board)];
    const next = player==="black"?"white":"black";

    set(ref(db,`rooms/${roomId}`),{
      board:nb,
      history:newHistory,
      turn:next,
      size,
      mode,
      players: mode==="ai"
        ? {black:userId, white:"AI"}
        : undefined
    });
  };

  // ===== AI =====
  useEffect(()=>{
    if(mode!=="ai" || turn!=="white" || !connected) return;

    setTimeout(()=>{
      for(let y=0;y<size;y++){
        for(let x=0;x<size;x++){
          if(!board[y][x]){
            const nb=playMove(board,x,y,"white");
            if(nb){
              set(ref(db,`rooms/${roomId}`),{
                board:nb,
                history:[...history, serialize(board)],
                turn:"black",
                size,
                mode
              });
              return;
            }
          }
        }
      }
    },500);
  },[turn,mode,board]);

  const CELL = Math.min(48, 400/size);

  return (
    <div style={{
      minHeight:"100vh",
      background:"#0f172a",
      color:"#fff",
      display:"flex",
      flexDirection:"column",
      alignItems:"center",
      padding:20
    }}>
      <h1>Go Online</h1>

      <div>
        <input value={roomId} onChange={e=>setRoomId(e.target.value)} />
        <button onClick={connect}>接続</button>
      </div>

      <div style={{marginTop:10}}>
        盤サイズ:
        <select value={size} onChange={e=>setSize(Number(e.target.value))}>
          <option value={9}>9路</option>
          <option value={13}>13路</option>
          <option value={19}>19路</option>
        </select>

        モード:
        <select value={mode} onChange={e=>setMode(e.target.value)}>
          <option value="pvp">対人</option>
          <option value="ai">AI</option>
        </select>
      </div>

      <div>あなた: {player}</div>
      <div>手番: {turn}</div>

      <div style={{
        position:"relative",
        width:CELL*(size-1),
        height:CELL*(size-1),
        background:"#d9a74f",
        marginTop:20
      }}>
        {[...Array(size)].map((_,i)=>(
          <React.Fragment key={i}>
            <div style={{
              position:"absolute",top:i*CELL,width:"100%",height:2,background:"#5b3a1a"
            }}/>
            <div style={{
              position:"absolute",left:i*CELL,height:"100%",width:2,background:"#5b3a1a"
            }}/>
          </React.Fragment>
        ))}

        {board.map((row,y)=>
          row.map((cell,x)=>(
            <div key={`${x}-${y}`}
              onClick={()=>click(x,y)}
              style={{
                position:"absolute",
                left:x*CELL,
                top:y*CELL,
                transform:"translate(-50%,-50%)",
                width:40,height:40,
                cursor:"pointer"
              }}
            >
              {cell && (
                <div style={{
                  width:24,height:24,
                  borderRadius:"50%",
                  background:cell==="black"
                    ? "radial-gradient(#666,#000)"
                    : "radial-gradient(#fff,#ccc)"
                }}/>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}