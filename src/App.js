import React from 'react';
import logo from './logo.svg';
import './App.css';

const wikiApiBaseRequest = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects&origin=*"
const wikiApiLinkRequest = "&prop=links&pllimit=500&titles="
const wikiApiBacklinkRequest = "&list=backlinks&blnamespace=0&bllimit=500&bltitle="

//https://en.wikipedia.org/w/api.php?action=query&format=jsonfm&formatversion=2&titles=Saskatoon_freezing_deaths&prop=links&pllimit=500
//https://en.wikipedia.org/w/api.php?action=query&format=jsonfm&formatversion=2&bltitle=Saskatoon_freezing_deaths&list=backlinks&bllimit=500


class WikiArticleChain extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      firstArticle: "Orion",
      lastArticle: "Blue cheese",
    };
  }

  handleChange = e => {
    const {name, value} = e.target;

    this.setState(() => ({
      [name]: value
    }))
  }

  render() {
    return (
      <div>
        First&nbsp;Article:&nbsp;
        <input type="text" name="firstArticle" value={this.state.firstArticle} onChange={this.handleChange}/>
        <br />
        Last&nbsp;Article:&nbsp;
        <input type="text" name="lastArticle" value={this.state.lastArticle} onChange={this.handleChange}/>
        <br />
        <button value="Find Chain" onClick={this.handleClick}>Find Chain</button>
      </div>
      
    );
  }

  handleClick = (e) => {
    this.findRelation(this.state.firstArticle, this.state.lastArticle)
    .then(relation => {
      let output = relation.join(" -> ");
      alert(output);
    })
    .catch(e => {
      alert(e);
    })
  }


  findRelation = async (first, last) => {
    let fwQueue = [first];
    let bwQueue = [last];

    // contains the current search state of an article
    // not preset -> haven't started fetching links
    // present, value set to "FETCHING" -> started a fetch
    // present, value set to plcontinue -> started, need to fetch again since there were more than 500 links
    // present, value set to "DONE" -> article links have been fully fetched, ignore
    let searched = new Map();

    let fwlinks = [{left: undefined, right: first}];
    let bwlinks = [{left: last, right: undefined}];

    let shared_title = undefined;

    let depth = 0;

    while (depth < 10){

      await this.stepRight(fwQueue, searched, fwlinks);

      shared_title = this.getSharedTitle(fwlinks, bwlinks);
      if (shared_title !== undefined) break;

      await this.stepLeft(bwQueue, searched, bwlinks);

      shared_title = this.getSharedTitle(fwlinks, bwlinks);
      if (shared_title !== undefined) break;

      depth += 2;

    }

    let relation = undefined;
    if (shared_title !== undefined) relation = this.getRelation(fwlinks, bwlinks, shared_title);
    else throw `Couldn't determine a connection between "${first}" and "${last}"; depth: ${depth}`;

    return relation;

  }

  getSharedTitle = (fwl, bwl) => {
    let shared_title = undefined;

    // sort the backlinks according to the title on the left side of the link
    bwl.sort((a,b) => {
      if (a.left === b.left) return 0;
      else return (a.left < b.left) ? -1 : 1;
    })

    // using the title on the right side of the forward links, look for that title in the backlinks
    for (let i = 0; i < fwl.length; i++){
      if (this.binarySearch(bwl, fwl[i].right, this.compare) >= 0)
        return fwl[i].right;
    }

    return undefined;
  }

  getRelation = (fwl, bwl, st) => {

    let relation = [st];
    let link = undefined;

    // build the left half of the relation
    let done = false;
    while (!done){
      if ((link = fwl.find(e => e.right === relation[0])) !== undefined){
        if (link.left === undefined) done = true;
        else relation.unshift(link.left);
      }
      else throw `Unable to find "${relation[0]}" in the forwardlink list`;
    }

    // build the right half of the relation
    done = false;
    while (!done){
      if ((link = bwl.find(e => e.left === relation[relation.length - 1])) !== undefined){
        if (link.right === undefined) done = true;
        else relation.push(link.right);
      }
      else throw `Unable to find "${relation[relation.length - 1]}" in the backwardlink list`;
    }

    return relation;
  }

  compare = (a,b) => {
    if (a === b) return 0;
    else return (a < b) ? -1 : 1
  }

  binarySearch = (a, e, compare) => {
    var m = 0;
    var n = a.length - 1;
    while (m <= n) {
        var k = (n + m) >> 1;
        var cmp = compare(e, a[k].left);
        if (cmp > 0) {
            m = k + 1;
        } else if(cmp < 0) {
            n = k - 1;
        } else {
            return k;
        }
    }
    return -m - 1;
}

  stepRight = async (queue, searched, links) => {

    const url = wikiApiBaseRequest + wikiApiLinkRequest;
    let fetches = []

    for (let i = 0; i < 100 && queue.length; i++){

      let title = queue.shift();
      let plcontinue = "";

      if (searched.has(title)){
        let s = searched.get(title);

        // if the title has already been fetched or is being fetched atm
        if (s === "DONE" || s === "FETCHING") continue;

        // if the title has a plcontinue value
        if (s !== undefined) plcontinue = s;
      }

      // start the fetching
      searched.set(title, "FETCHING");


      let this_fetch = fetch(url + title + plcontinue)
      .then(response => {

        if (response.ok) return response.json()
        else throw `fetch to article '${title}' returned ${response.status}`;

      })
      .then(data => {
        
        data.query.pages[0].links.forEach(link => {

          // add newly found links
          links.push({left: title, right: link.title});

          // push unsearched articles to the queue
          if (!searched.has(link.title)) queue.push(link.title);
        })

        console.log(links.length)

        // if there's more than 500 links, another call is needed with plcontinue
        if (data.continue?.plcontinue !== undefined){
          queue.push(title);
          searched.set(title, "&plcontinue=" + data.continue?.plcontinue);
        }
        else
          searched.set(title, "DONE");

      })
      .catch(error => {
        queue.push(title);
        searched.set(title, plcontinue);
      })

      fetches.push(this_fetch);
      i++;
    }

    return Promise.allSettled(fetches);
  }


  stepLeft = async (queue, searched, links) => {

    const url = wikiApiBaseRequest + wikiApiBacklinkRequest;
    let fetches = []

    for (let i = 0; i < 100 && queue.length; i++){

      let title = queue.shift();
      let blcontinue = "";

      if (searched.has(title)){
        let s = searched.get(title);

        // if the title has already been fetched or is being fetched atm
        if (s === "DONE" || s === "FETCHING") continue;

        // if the title has a blcontinue value
        if (s !== undefined) blcontinue = s;
      }

      // start the fetching
      searched.set(title, "FETCHING");


      let this_fetch = fetch(url + title + blcontinue)
      .then(response => {

        if (response.ok) return response.json()
        else throw `fetch to article '${title}' returned ${response.status}`;

      })
      .then(data => {
        
        data.query.backlinks.forEach(link => {

          // add newly found links
          links.push({left: link.title, right: title});

          // push unsearched articles to the queue
          if (!searched.has(link.title)) queue.push(link.title);
        })

        console.log(links.length)

        // if there's more than 500 links, another call is needed with blcontinue
        if (data.continue?.blcontinue !== undefined){
          queue.push(title);
          searched.set(title, "&blcontinue=" + data.continue?.blcontinue);
        }
        else
          searched.set(title, "DONE");

      })
      .catch(error => {
        queue.push(title);
        searched.set(title, blcontinue);
      })

      fetches.push(this_fetch);
      i++;
    }

    return Promise.allSettled(fetches);
  }

  
}

function App() {
  return (
    <WikiArticleChain />
  );
}

export default App;
