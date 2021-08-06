'use strict';

const axios = require('axios');
const knowledgeData = require('./data.json');

// for (let i in knowledgeData) {
//     console.log(knowledgeData[i]);
// }

for (let i in knowledgeData) {
    // send a POST request
    axios({
        method: 'post',
        url: 'https://us-central1-programmingdanny-5a8b2.cloudfunctions.net/knowledgeUpload',
        data: {
            name: knowledgeData[i].name,
            content: knowledgeData[i]
        }
    })
        // .then(() => { console.log(`${knowledgeData[i].level}'s ${knowledgeData[i].name} is updated successful`) })
        .catch((err => { console.log(err) }));
}

/*
    {
        "level": "",
        "name": "",
        "content": {
            "description": [
                ""
            ]
        }
    }
*/