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

const SIZE = 9;
const CELL = 48;

const createBoard = () =>
  Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

const serialize = (b) => JSON.stringify(b);

const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

function getGroup(b,x,y,visited=new Set()){
  const c=b[y][x];
  const k=`${x},${y}`;
  if(visited.has(k)) return [];
  visited.add(k);
  let g=[[x,y]];
  dirs.forEach(([dx,dy])=>{
    const nx=x+dx, ny=y+dy;
    if(nx>=0&&ny>=0&&nx<SIZE&&ny<SIZE&&b[ny][nx]===c){
      g=g.concat(getGroup(b,nx,ny,visited));
    }
  });
  return g;
}

function hasLiberty(b,g){
  return g.some(([x,y]) =>
    dirs.some(([dx,dy])=>{
      const nx=x+dx, ny=y+dy;
      return nx>=0&&ny>=0&&nx<SIZE&&ny<SIZE&&b[ny][nx]===null;
    })
  );
}

export default function App(){
  const [board,setBoard]=useState(createBoard());
  const [history,setHistory]=useState([]);
  const [turn,setTurn]=useState("black");
  const [roomId,setRoomId]=useState("");
  const [connected,setConnected]=useState(false);
  const [player,setPlayer]=useState(null);
  const [lastMove,setLastMove]=useState(null);

  const userId = useMemo(()=>Math.random().toString(36).slice(2,10),[]);

  useEffect(()=>{
    if(!connected||!roomId) return;

    const r=ref(db,`rooms/${roomId}`);
    const unsub=onValue(r,s=>{
      const d=s.val();
      if(!d) return;

      setBoard(d.board || createBoard());
      setTurn(d.turn || "black");
      setHistory(d.history || []);
      setLastMove(d.lastMove || null);

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
        board:createBoard(),
        history:[],
        turn:"black",
        players:{black:userId}
      });
      setPlayer("black");
    }else{
      const d=snap.val();
      let u={};

      if(!d.players?.black){
        u["players/black"]=userId;
        setPlayer("black");
      }else if(!d.players?.white){
        u["players/white"]=userId;
        setPlayer("white");
      }else{
        alert("満員");
        return;
      }
      await update(r,u);
    }

    setConnected(true);
  };

  const click=(x,y)=>{
    if(turn!==player || board[y][x]) return;

    const nb=board.map(r=>[...r]);
    nb[y][x]=player;
    const opp=player==="black"?"white":"black";

    dirs.forEach(([dx,dy])=>{
      const nx=x+dx, ny=y+dy;
      if(nx>=0&&ny>=0&&nx<SIZE&&ny<SIZE&&nb[ny][nx]===opp){
        const g=getGroup(nb,nx,ny);
        if(!hasLiberty(nb,g)){
          g.forEach(([gx,gy])=>nb[gy][gx]=null);
        }
      }
    });

    const self=getGroup(nb,x,y);
    if(!hasLiberty(nb,self)) return;

    // コウ判定（履歴比較）
    const key = serialize(nb);
    if(history.includes(key)){
      alert("コウ禁止");
      return;
    }

    const newHistory = [...history, serialize(board)];

    set(ref(db,`rooms/${roomId}`),{
      board:nb,
      history:newHistory,
      turn:opp,
      lastMove:{x,y}
    });
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"#0f172a",
      color:"#e2e8f0",
      display:"flex",
      flexDirection:"column",
      alignItems:"center",
      padding:20
    }}>
      <h1 style={{fontSize:28,fontWeight:"bold"}}>Go Online</h1>

      <div style={{marginBottom:10}}>
        <input value={roomId} onChange={e=>setRoomId(e.target.value)} />
        <button onClick={connect}>接続</button>
      </div>

      <div>あなた: {player}</div>
      <div>手番: {turn}</div>

      <div style={{
        position:"relative",
        width:CELL*(SIZE-1),
        height:CELL*(SIZE-1),
        background:"#d9a74f",
        boxShadow:"inset 0 0 20px rgba(0,0,0,0.4)",
        marginTop:20
      }}>
        {[...Array(SIZE)].map((_,i)=>(
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
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                cursor:"pointer"
              }}
            >
              {lastMove?.x===x && lastMove?.y===y && (
                <div style={{
                  position:"absolute",
                  width:44,height:44,
                  borderRadius:"50%",
                  background:"rgba(255,255,255,0.3)"
                }}/>
              )}

              {cell && (
                <div style={{
                  width:26,height:26,
                  borderRadius:"50%",
                  background:cell==="black"
                    ? "radial-gradient(circle at 30% 30%, #666, #000)"
                    : "radial-gradient(circle at 30% 30%, #fff, #ccc)",
                  boxShadow:"0 4px 10px rgba(0,0,0,0.7)"
                }}/>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}