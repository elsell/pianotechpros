// Read-only synthetic presentation data. Production domain behavior is tested elsewhere.
export function createNativeInventoryFixture(now){
 const dealer={id:'00000000-0000-4000-8000-000000000001',name:'Native UI Shop',slug:'native-ui-shop',email:'shop@example.test',accent_color:'#245b43',revision:1,showroom_published:false};
 const statuses=['draft','available','reserved','in_service','sold','archived'];
 const names=['Draft','Available','Reserved','Service','Sold','Archived'];
 const stamp=new Date(now()).toISOString();
 const records=statuses.map((status,index)=>({id:`00000000-0000-4000-8001-${String(index+1).padStart(12,'0')}`,dealer_id:dealer.id,revision:1,status,created_at:stamp,updated_at:stamp,attributes:{stock_number:`UI-${String(index+1).padStart(3,'0')}`,title:`UI ${names[index]} Piano`,make:'Synthetic',model:names[index],featured:index===0}}));
 return (req,url,send)=>{
  if(req.method!=='GET')return false;
  if(url.pathname==='/v1/dealers'){send(200,{data:[dealer],meta:{}});return true;}
  if(url.pathname==='/v1/dealers/'+dealer.id){send(200,{data:dealer});return true;}
  const recordPath=`/v1/dealers/${dealer.id}/inventory/`;
  if(url.pathname.startsWith(recordPath)){
   const [id,surface,...extra]=url.pathname.slice(recordPath.length).split('/');
   const record=records.find(value=>value.id===id);
   if(!record||extra.length)return false;
   if(surface===undefined){send(200,{data:record});return true;}
   if(surface==='photos'){send(200,{data:{record,photos:[]}});return true;}
   if(surface==='publication'){send(200,{data:{record,publication:null}});return true;}
   return false;
  }
  if(url.pathname!==`/v1/dealers/${dealer.id}/inventory`)return false;
  const p=url.searchParams,status=p.get('status'),search=(p.get('search')??'').trim().toLowerCase();
  const rawLimit=p.get('limit')??'30',cursor=p.get('cursor');
  if(!/^\d+$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>100||status&&!statuses.includes(status)||search.length>120||cursor&&!/^ui:[0-6]$/.test(cursor)){
   send(400,{code:'bad_request'});return true;
  }
  const matches=records.filter(record=>(status?record.status===status:p.get('includeInactive')==='true'||!['sold','archived'].includes(record.status))&&['stock_number','title','make','model'].some(key=>record.attributes[key].toLowerCase().includes(search)));
  const offset=cursor?Number(cursor.slice(3)):0,limit=Number(rawLimit),data=matches.slice(offset,offset+limit);
  send(200,{data,meta:offset+limit<matches.length?{nextCursor:`ui:${offset+limit}`}:{}});return true;
 };
}
