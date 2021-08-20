'use strict';

const axios = require('axios');
const knowledgeData = require('./data.json');
for (let i in knowledgeData) {
    // send a POST request
    axios({
        method: 'post',
        url: '',
        data: {
            name: knowledgeData[i].name,
            content: knowledgeData[i]
        }
    })
        .then(() => { console.log(`${knowledgeData[i].level}'s ${knowledgeData[i].name} is updated successful`) })
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