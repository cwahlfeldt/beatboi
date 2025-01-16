import * as dotenv from 'dotenv';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  dotenv.config();
}