import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, get, update } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "test-ig-31e35.firebaseapp.com",
  databaseURL: "https://test-ig-31e35-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-ig-31e35",
  storageBucket: "test-ig-31e35.appspot.com",
  messagingSenderId: "532701227283",
  appId: "1:532701227283:web:ed90d07d5db239f26192e6"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SIZE = 9;
const CELL = 48;

const createBoard = () =>
  Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

const normalize = (data) => {
  const empty = createBoard();
  if (!data?.board) return empty;
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) =>
      data.board?.[y]?.[x] ?? null
    )
  );
};

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

const sameBoard = (a,b)=>JSON.stringify(a)===JSON.stringify(b);

export default function App(){
  const [board,setBoard]=useState(createBoard());
  const [prevBoard,setPrevBoard]=useState(null);
  const [turn,setTurn]=useState("black");
  const [roomId,setRoomId]=useState("");
  const [connected,setConnected]=useState(false);
  const [player,setPlayer]=useState(null);
  const [lastMove,setLastMove]=useState(null);
  const [passCount,setPassCount]=useState(0);
  const [result,setResult]=useState(null);

  const userId = useMemo(()=>Math.random().toString(36).slice(2,10),[]);

  // URLからroom取得
  useEffect(()=>{
    const urlParams = new URLSearchParams(window.location.search);
    const rid = urlParams.get("room");
    if(rid){
      setRoomId(rid);
    }
  },[]);

  useEffect(()=>{
    if(!connected||!roomId) return;

    const r=ref(db,`rooms/${roomId}`);
    const unsub=onValue(r,s=>{
      const d=s.val();
      if(!d) return;

      setBoard(normalize(d));
      setTurn(d.turn||"black");
      setPrevBoard(d.prevBoard||null);
      setLastMove(d.lastMove||null);
      setPassCount(d.passCount||0);
      setResult(d.result||null);

      if(d.players){
        if(d.players.black===userId) setPlayer("black");
        if(d.players.white===userId) setPlayer("white");
      }
    });

    return ()=>unsub();
  },[connected,roomId,userId]);

  const connect=async()=>{
    const r=ref(db,`rooms/${roomId}`);
    const snap=await get(r);

    if(!snap.exists()){
      await set(r,{
        board:createBoard(),
        prevBoard:null,
        turn:"black",
        players:{black:userId},
        passCount:0
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

    // URL更新
    window.history.replaceState(null,"",`?room=${roomId}`);
    setConnected(true);
  };

  const click=(x,y)=>{
    if(!connected||turn!==player||board[y][x]||result) return;

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

    if(prevBoard && sameBoard(nb, prevBoard)){
      alert("コウで禁止手");
      return;
    }

    set(ref(db,`rooms/${roomId}`),{
      board:nb,
      prevBoard:board,
      turn:opp,
      lastMove:{x,y},
      passCount:0
    });
  };

  const pass=()=>{
    const newPass = passCount + 1;

    if(newPass >= 2){
      // 簡易勝敗（石数）
      let black=0, white=0;
      board.forEach(r=>r.forEach(c=>{
        if(c==="black") black++;
        if(c==="white") white++;
      }));

      const resultText = black > white ? "黒勝ち" : "白勝ち";

      set(ref(db,`rooms/${roomId}`),{
        ...{
          board, prevBoard, turn
        },
        result: resultText
      });
    }else{
      set(ref(db,`rooms/${roomId}`),{
        board,
        prevBoard,
        turn: turn==="black"?"white":"black",
        passCount:newPass
      });
    }
  };

  const reset=()=>{
    set(ref(db,`rooms/${roomId}`),{
      board:createBoard(),
      turn:"black",
      prevBoard:null,
      passCount:0,
      result:null
    });
  };

  const createRoom=()=>{
    setRoomId(Math.random().toString(36).slice(2,8));
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg,#1e293b,#334155)",
      color:"#e5e7eb",
      display:"flex",
      flexDirection:"column",
      alignItems:"center",
      padding:"20px"
    }}>
      <h1>Go Online</h1>

      <div>
        <input value={roomId} onChange={e=>setRoomId(e.target.value)} />
        <button onClick={createRoom}>新規</button>
        <button onClick={connect}>接続</button>
      </div>

      <div>あなた: {player || "未割当"}</div>
      <div style={{color: turn===player ? "#22c55e":"#94a3b8"}}>
        手番: {turn}
      </div>

      {result && <h2>{result}</h2>}

      <div>
        <button onClick={pass}>パス</button>
        <button onClick={reset}>リセット</button>
      </div>

      <div style={{
        position:"relative",
        width: CELL * (SIZE-1),
        height: CELL * (SIZE-1),
        marginTop:"20px",
        background:"#d1a95a"
      }}>
        {[...Array(SIZE)].map((_,i)=>(
          <React.Fragment key={i}>
            <div style={{
              position:"absolute", top:i*CELL, width:"100%", height:2, background:"#5b3a1a"
            }}/>
            <div style={{
              position:"absolute", left:i*CELL, height:"100%", width:2, background:"#5b3a1a"
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
                width:36,
                height:36,
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                cursor:"pointer"
              }}
            >
              {lastMove?.x===x && lastMove?.y===y && (
                <div style={{
                  position:"absolute",
                  width:40,height:40,
                  borderRadius:"50%",
                  background:"rgba(255,255,255,0.25)"
                }}/>
              )}

              {cell && (
                <div style={{
                  width:24,height:24,
                  borderRadius:"50%",
                  background:cell,
                  boxShadow:"0 3px 8px rgba(0,0,0,0.6)"
                }}/>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}