import path from 'path';
import { app } from 'electron';
import webpackPaths from '../../../../.erb/configs/webpack.paths';

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

export const databaseConfig = {
  name: 'myCoolDatabase.sqlite3',
  getPath: () => {
    const databaseName = 'myCoolDatabase.sqlite3';
    const sqlPath_dev = path.join(webpackPaths.appPath, 'sql', databaseName);
    const sqlPath_prod = path.join(app.getPath('userData'), databaseName);
    
    return isDebug ? sqlPath_dev : sqlPath_prod;
  },
  getDevPath: () => {
    return path.join(webpackPaths.appPath, 'sql', 'myCoolDatabase.sqlite3');
  },
  getProdPath: () => {
    return path.join(app.getPath('userData'), 'myCoolDatabase.sqlite3');
  },
  isDebug,
};

export default databaseConfig;
