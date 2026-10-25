export type InquiryChallengeConfig={policy:'unavailable'|'disabled'}|{policy:'enabled';siteKey:string};
export function inquiryChallengeConfig(policy:string|undefined,siteKey:string|undefined):InquiryChallengeConfig{
 const key=siteKey??'';
 if(!policy&&!key)return {policy:'unavailable'};
 if(policy==='disabled'&&!key)return {policy:'disabled'};
 if(policy==='enabled'&&/^[A-Za-z0-9_-]{1,256}$/.test(key))return {policy:'enabled',siteKey:key};
 throw new Error('invalid_inquiry_challenge_configuration');
}
