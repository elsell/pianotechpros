import type {PublicationMissingField} from './inventory-publication-workspace';
/** Guidance for a freshly fetched saved record. The API still authorizes and validates publication. */
export function publicationReadiness(attributes:{form?:string;condition?:string;title?:string;make?:string},readyPhotos:number):PublicationMissingField[]{
 const missing:PublicationMissingField[]=[];
 if(!attributes.form?.trim())missing.push('form');
 if(!attributes.condition?.trim())missing.push('condition');
 if(!attributes.title?.trim()&&!attributes.make?.trim())missing.push('title');
 if(!Number.isSafeInteger(readyPhotos)||readyPhotos<1)missing.push('photo');
 return missing;
}
