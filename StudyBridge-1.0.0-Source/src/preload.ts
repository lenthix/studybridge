import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('study',{init:()=>ipcRenderer.invoke('init'),command:(value:unknown)=>ipcRenderer.invoke('command',value),subscribe:(callback:(value:any)=>void)=>{const listener=(_event:unknown,value:any)=>callback(value);ipcRenderer.on('state',listener);return()=>ipcRenderer.removeListener('state',listener);}});
