const config = require('config');
const dbConfig = require('../dbConfig.js');
const knex = require('knex')(dbConfig);

/*
 * Function to return the list of mood
 */
exports.Moods = function(req, res){
  // To help with auth problem because moods are cached
  res.header("Cache-Control", "no-cache, no-store, must-revalidate");
  res.header("Pragma", "no-cache");
  res.header("Expires", 0);

  knex.select('genres.id', 'genres.name')
    .count('songs.id as nbSongs')
    .count('songs.youtube as nbVideo')
    .from('genres')
    .join('genres_relations', 'genres.id', '=', 'genres_relations.id')
    .join('songs', 'songs.id', '=', 'genres_relations.id_song')
    .groupBy('genres.id')
    .then(function(rows) {
      return res.send(
        shuffleArray(rows)
      );
    })
    .catch(function(error) {
      console.error(error);
    });
}

/*
 * Function to get song infos by submitting a genre
 */
exports.Mood = function(req, res){
  // Disabling cache for myurl.com/genre/id URLs to prevent some browser to play the same song again and again and again...
  res.header("Cache-Control", "no-cache, no-store, must-revalidate");
  res.header("Pragma", "no-cache");
  res.header("Expires", 0);

  var moodId = req.body.moodId;
  var videoMode = req.body.videoMode;

  // Making an array of the already played songs
  var songsIdAlreadyPlayed = [];
  if (req.session.playedSongs && req.session.playedSongs.length != 0 && req.session.playedSongs != []) {
    req.session.playedSongs.forEach(function(songId) {
      songsIdAlreadyPlayed.push(songId);
    });
  }

  var select = knex.select(
    'songs.id',
    'songs.name as song',
    'artists.name AS artist',
    'songs.path',
    'albums.name AS album',
    'genres_relations.id as moodId',
    'songs.youtube',
    'songs.created_at'
  )
    .from('songs')
    .join('genres_relations', 'songs.id', '=', 'genres_relations.id_song')
    .join('artists', 'artists.id', '=', 'songs.id_artist')
    .join('albums', 'albums.id', '=', 'songs.id_album')
    .where('genres_relations.id', moodId)
    .whereNotIn('songs.id', songsIdAlreadyPlayed);

  if (videoMode) {
    select = select.whereNotNull('songs.youtube');
  }

  select.then(function(rows) {
      if (rows.length > 0) {
        // Resetting the list of played songs if the delay configured in config is passed
        if (req.session.lastVisit != undefined) {
          if(Date.now() - req.session.lastVisit > config.get('global.moodResetSinceLastVisit')) {
            req.session.playedSongs = undefined;
          }
        }
        req.session.lastVisit = Date.now();

        const randomSongs = shuffleArray(rows);

        return res.send({
          songs: randomSongs,
        });
      }
      else {
        var error = {"allSongGenrePlayed": 1};
        return res.send({error});
      }
    })
    .catch(function(error) {
      console.error(error);
    });
};

/**
 * Search songs by keywords
 */
exports.Search = function(req, res){
  const keywords = req.params.keywords;
  const similarity_threshold = 0.25;

  knex.select(
    'songs.id',
    'songs.name AS song',
    'songs.youtube AS youtube',
    'artists.name AS artist',
    'songs.path',
    'albums.name AS album',
    'genres.name AS mood',
    'genres.id AS moodId'
  )
    .from('songs')
    .join('genres_relations', 'songs.id',   '=', 'genres_relations.id_song')
    .join('genres',           'genres.id',  '=', 'genres_relations.id')
    .join('artists',          'artists.id', '=', 'songs.id_artist')
    .join('albums',           'albums.id',  '=', 'songs.id_album')
    .whereRaw("SIMILARITY(?, artists.name) > ?", [keywords, similarity_threshold])
    .orWhereRaw("SIMILARITY(?, albums.name) > ?", [keywords, similarity_threshold])
    .orWhereRaw("SIMILARITY(?, songs.name) > ?", [keywords, similarity_threshold])
    .orderByRaw("SIMILARITY(?, artists.name) + SIMILARITY(?, albums.name) + SIMILARITY(?, songs.name)", [keywords, keywords, keywords])
    .then(function(rows) {
      if (rows.length > 0) {
        return res.send( rows );
      } else {
        return res.send( {} );
      }
    })
    .catch(function(error) {
      console.error(error);
    });
};

/*
 * Function to get song infos by submitting a genre
 */
exports.whatsNew = function(req, res){
  res.header("Cache-Control", "no-cache, no-store, must-revalidate");
  res.header("Pragma", "no-cache");
  res.header("Expires", 0);

  var page = req.params.page;

  var select = knex.select('songs.id', 'songs.name as song', 'artists.name AS artist', 'genres.id AS moodId', 'genres.name AS mood', 'songs.path', 'albums.name AS album', 'songs.youtube', 'songs.created_at')
    .from('songs')
    .join('genres_relations', 'songs.id', '=', 'genres_relations.id_song')
    .join('genres', 'genres_relations.id', '=', 'genres.id')
    .join('artists', 'artists.id', '=', 'songs.id_artist')
    .join('albums', 'albums.id', '=', 'songs.id_album')
    .limit(10)
    .orderBy('songs.created_at', 'desc');

  if (page)
    select.offset(page * 10);

  select.then(function(rows) {
    if (rows.length > 0) {
      return res.send(rows);
    } else {
      return res.send({});
    }

  })
  .catch(function(err) {
    console.error(err);
  });
};

/*
 * If a song is played from the search result, this function will add it to the played songs list
 */
exports.playedSong = function(req, res){
  var songId = req.params.songId;

  // Saving song played id
  if (req.session.playedSongs == undefined) {
    req.session.playedSongs = [songId];
  }
  else {
    req.session.playedSongs.push(songId);
  }

  // Necessary to save the session (or req.session.save();) but cleaner because it gives a response to the client
  return res.send("Done");
}

/*
 * Reset list of songs stored in sessions
 */
exports.ResetMood = function(req, res){
  var moodId = req.params.id;

  knex('genres_relations')
    .where('id', moodId)
    .then(function(rows) {
      rows.forEach(function(entry, index) {
        var i = req.session.playedSongs.indexOf(entry.id_song);
        req.session.playedSongs.splice(i, 1);
      });
      return res.send("Mood ID : " + moodId);
    })
    .catch(function(error) {
      console.error(error);
    });
};

/*
 * Reset session
 */
exports.ResetSession = function(req, res){
  req.session.playedSongs = [];
  return res.send("Done");
};

/**
 * Randomize array element order in-place.
 * Using Durstenfeld shuffle algorithm.
 */
function shuffleArray(array) {
  for (var i = array.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

