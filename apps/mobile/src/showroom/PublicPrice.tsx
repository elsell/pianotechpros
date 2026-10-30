import {Text,type StyleProp,type TextStyle} from 'react-native';
import type {PublicPiano} from '@pianotechpros/api-client';
import {useMobileSession} from '../session-provider';

export function PublicPrice({price,style}:{price:PublicPiano['price'];style?:StyleProp<TextStyle>}){
 const {i18n}=useMobileSession();
 const display=price?i18n.money(price.minor_units,price.currency):i18n.t('showroom.requestPrice');
 return <Text style={style} accessibilityLabel={price?i18n.t('showroom.priceLabel',{price:display}):display}>{display}</Text>;
}
