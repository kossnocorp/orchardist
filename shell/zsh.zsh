# Keep this file synchronized (without the comment) with the Zsh snippet in README.md.

autoload -Uz add-zsh-hook

__orchardist_parse_discriminators() {
  typeset -ga __orchardist_paths __orchardist_names __orchardist_symbols
  __orchardist_paths=()
  __orchardist_names=()
  __orchardist_symbols=()
  __orchardist_parsed_discriminators=${ORCHARDIST_DISCRIMINATORS-}
  [[ -n $__orchardist_parsed_discriminators ]] || return 1

  local -a parts
  parts=("${(@s:;:)__orchardist_parsed_discriminators}")
  local index
  for ((index = 1; index + 2 <= ${#parts}; index += 3)); do
    if [[ -n ${parts[index]} && -n ${parts[index + 2]} ]]; then
      __orchardist_paths+=("${parts[index]}")
      __orchardist_names+=("${parts[index + 1]}")
      __orchardist_symbols+=("${parts[index + 2]}")
    fi
  done
}

__orchardist_on_pwd() {
  [[ -n ${ORCHARDIST_DISCRIMINATORS-} ]] || return
  if [[ ${__orchardist_parsed_discriminators-} != $ORCHARDIST_DISCRIMINATORS ]]; then
    __orchardist_parse_discriminators || return
  fi

  local best=0 best_length=0 index path
  for ((index = 1; index <= ${#__orchardist_paths}; index++)); do
    path=${__orchardist_paths[index]}
    if [[ ($PWD == $path || $PWD == "$path"/*) && ${#path} -gt $best_length ]]; then
      best=$index
      best_length=${#path}
    fi
  done

  if ((best > 0)); then
    export ORCHARDIST_WORKTREE_NAME=${__orchardist_names[best]}
    export ORCHARDIST_WORKTREE_SYMBOL=${__orchardist_symbols[best]}
  else
    unset ORCHARDIST_WORKTREE_NAME ORCHARDIST_WORKTREE_SYMBOL
  fi
}

add-zsh-hook chpwd __orchardist_on_pwd
add-zsh-hook precmd __orchardist_on_pwd
__orchardist_on_pwd
