import React, { useState } from 'react';
import { asyncSql } from "../index.tsx";

function SqlDemoApp() {
    const [message, setMessage] = useState('SELECT sqlite_version()');
    const [response, setResponse] = useState();

    function send(sql) {
        asyncSql(sql).then((result) => setResponse(result));
    }

    return (
        <>
            <div className="h4" >Test it out</div>

            <div className="infoItem" >
                Type in an SQL command, or copy and paste one of the example SQL commands below, and submit it to the main process (by clicking 'Send').
            </div>

            <pre>
                SELECT sqlite_version()
                <br/>
                SELECT * FROM sqlite_schema
                <br/>
                CREATE TABLE IF NOT EXISTS testTable (id INTEGER PRIMARY KEY AUTOINCREMENT, itemName TEXT NULL)
                <br/>
                INSERT OR IGNORE INTO testTable (itemName) VALUES ('foo')
                <br/>
                SELECT * FROM testTable
            </pre>

            <div className="infoItem" >
                For more SQL commands, see: <a href="https://www.sqlitetutorial.net/sqlite-nodejs/" target="_blank" >SQLite tutorial</a>
            </div>

            <div className="infoItem" >
              <input style={{width:"80%"}}
                  type="text"
                  value={message}
                  onChange={({ target: { value } }) => setMessage(value)}
              />
              <button type="button" onClick={() => send(message)}>
                  Send
              </button>
            </div>

            <div className="infoItem" >The SQL response, transmitted via IRC from the main process to the renderer process (here), is an object in JSON:</div>

            <pre style={{border:"1px solid orange"}} >
                {(response && JSON.stringify(response, null, 2)) ||
                    'No query results yet!'}
            </pre>
        </>
    );
}

export default SqlDemoApp
